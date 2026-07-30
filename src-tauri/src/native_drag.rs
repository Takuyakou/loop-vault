use crate::midi_export::{validated_drag_path, MidiExportState};
use serde::Serialize;
use std::{path::PathBuf, sync::mpsc};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeMidiDragResult {
    status: String,
    effect: u32,
    error_code: Option<i32>,
}

#[tauri::command]
pub fn start_progression_midi_drag(
    app: tauri::AppHandle,
    window: tauri::Window,
    state: tauri::State<'_, MidiExportState>,
    drag_token: String,
) -> Result<NativeMidiDragResult, String> {
    let path = validated_drag_path(&app, state.inner(), &drag_token)?;
    let (sender, receiver) = mpsc::channel();
    window
        .run_on_main_thread(move || {
            let result = start_native_drag_on_current_thread(&path);
            let _ = sender.send(result);
        })
        .map_err(|_| "The native MIDI drag could not start.".to_string())?;
    receiver
        .recv()
        .map_err(|_| "The native MIDI drag did not finish.".to_string())?
}

#[cfg(windows)]
fn start_native_drag_on_current_thread(path: &PathBuf) -> Result<NativeMidiDragResult, String> {
    Ok(windows_drag::start_file_drag(path))
}

#[cfg(not(windows))]
fn start_native_drag_on_current_thread(_path: &PathBuf) -> Result<NativeMidiDragResult, String> {
    Err("Native MIDI drag-out is only supported on Windows.".to_string())
}

#[cfg(windows)]
mod windows_drag {
    use super::NativeMidiDragResult;
    use std::{mem, os::windows::ffi::OsStrExt, path::PathBuf, ptr, sync::Mutex};
    use windows::Win32::{
        Foundation::{
            DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS, DV_E_FORMATETC,
            E_INVALIDARG, E_NOTIMPL, HGLOBAL, POINT, S_FALSE, S_OK,
        },
        System::{
            Com::{
                IAdviseSink, IDataObject, IDataObject_Impl, IEnumFORMATETC, IEnumSTATDATA,
                DATADIR_GET, DVASPECT_CONTENT, FORMATETC, STGMEDIUM, STGMEDIUM_0, TYMED_HGLOBAL,
            },
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT},
            Ole::{
                DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, OleUninitialize,
                DROPEFFECT, DROPEFFECT_COPY,
            },
            SystemServices::{MK_LBUTTON, MODIFIERKEYS_FLAGS},
        },
        UI::Shell::DROPFILES,
    };
    use windows_core::{implement, Error, Result, BOOL, HRESULT};

    pub fn start_file_drag(path: &PathBuf) -> NativeMidiDragResult {
        if unsafe { OleInitialize(None) }.is_err() {
            return drag_error(None);
        }
        let (status, effect_value, error_code) = unsafe {
            let data_object: IDataObject = FileDropDataObject { path: path.clone() }.into();
            let drop_source: IDropSource = FileDropSource.into();
            let mut effect = DROPEFFECT(0);
            let drag_result = DoDragDrop(&data_object, &drop_source, DROPEFFECT_COPY, &mut effect);
            OleUninitialize();

            if drag_result == DRAGDROP_S_DROP {
                ("dropped".to_string(), effect.0 as u32, None)
            } else if drag_result == DRAGDROP_S_CANCEL {
                ("cancelled".to_string(), effect.0 as u32, None)
            } else {
                ("error".to_string(), effect.0 as u32, Some(drag_result.0))
            }
        };
        NativeMidiDragResult {
            status,
            effect: effect_value,
            error_code,
        }
    }

    fn drag_error(error_code: Option<i32>) -> NativeMidiDragResult {
        NativeMidiDragResult {
            status: "error".to_string(),
            effect: 0,
            error_code,
        }
    }

    #[implement(IDataObject)]
    struct FileDropDataObject {
        path: PathBuf,
    }

    impl FileDropDataObject_Impl {
        fn supports_format(format: *const FORMATETC) -> bool {
            if format.is_null() {
                return false;
            }
            let format = unsafe { *format };
            format.cfFormat == 15
                && format.dwAspect == DVASPECT_CONTENT.0
                && format.tymed & TYMED_HGLOBAL.0 as u32 != 0
        }
    }

    #[allow(non_snake_case)]
    impl IDataObject_Impl for FileDropDataObject_Impl {
        fn GetData(&self, format: *const FORMATETC) -> Result<STGMEDIUM> {
            if !Self::supports_format(format) {
                return Err(Error::from_hresult(DV_E_FORMATETC));
            }
            let hglobal = build_hdrop_global(&self.path)?;
            Ok(STGMEDIUM {
                tymed: TYMED_HGLOBAL.0 as u32,
                u: STGMEDIUM_0 { hGlobal: hglobal },
                pUnkForRelease: mem::ManuallyDrop::new(None),
            })
        }

        fn GetDataHere(&self, _format: *const FORMATETC, _medium: *mut STGMEDIUM) -> Result<()> {
            Err(Error::from_hresult(E_NOTIMPL))
        }

        fn QueryGetData(&self, format: *const FORMATETC) -> HRESULT {
            if Self::supports_format(format) {
                S_OK
            } else {
                DV_E_FORMATETC
            }
        }

        fn GetCanonicalFormatEtc(
            &self,
            _input: *const FORMATETC,
            _output: *mut FORMATETC,
        ) -> HRESULT {
            E_NOTIMPL
        }

        fn SetData(
            &self,
            _format: *const FORMATETC,
            _medium: *const STGMEDIUM,
            _release: BOOL,
        ) -> Result<()> {
            Err(Error::from_hresult(E_NOTIMPL))
        }

        fn EnumFormatEtc(&self, direction: u32) -> Result<IEnumFORMATETC> {
            if direction == DATADIR_GET.0 as u32 {
                Ok(FormatEtcEnumerator::new(vec![hdrop_format_etc()]).into())
            } else {
                Err(Error::from_hresult(E_INVALIDARG))
            }
        }

        fn DAdvise(
            &self,
            _format: *const FORMATETC,
            _flags: u32,
            _sink: windows_core::Ref<'_, IAdviseSink>,
        ) -> Result<u32> {
            Err(Error::from_hresult(E_NOTIMPL))
        }

        fn DUnadvise(&self, _connection: u32) -> Result<()> {
            Err(Error::from_hresult(E_NOTIMPL))
        }

        fn EnumDAdvise(&self) -> Result<IEnumSTATDATA> {
            Err(Error::from_hresult(E_NOTIMPL))
        }
    }

    #[implement(IDropSource)]
    struct FileDropSource;

    #[allow(non_snake_case)]
    impl IDropSource_Impl for FileDropSource_Impl {
        fn QueryContinueDrag(
            &self,
            escape_pressed: BOOL,
            key_state: MODIFIERKEYS_FLAGS,
        ) -> HRESULT {
            if escape_pressed.as_bool() {
                return DRAGDROP_S_CANCEL;
            }
            if key_state & MK_LBUTTON == MODIFIERKEYS_FLAGS(0) {
                return DRAGDROP_S_DROP;
            }
            S_OK
        }

        fn GiveFeedback(&self, _effect: DROPEFFECT) -> HRESULT {
            DRAGDROP_S_USEDEFAULTCURSORS
        }
    }

    fn build_hdrop_global(path: &PathBuf) -> Result<HGLOBAL> {
        let mut wide_path: Vec<u16> = path.as_os_str().encode_wide().collect();
        wide_path.push(0);
        wide_path.push(0);
        let header_size = mem::size_of::<DROPFILES>();
        let bytes_len = header_size + wide_path.len() * mem::size_of::<u16>();
        unsafe {
            let hglobal = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes_len)?;
            let pointer = GlobalLock(hglobal);
            if pointer.is_null() {
                return Err(Error::from_win32());
            }
            ptr::write(
                pointer.cast::<DROPFILES>(),
                DROPFILES {
                    pFiles: header_size as u32,
                    pt: POINT { x: 0, y: 0 },
                    fNC: BOOL(0),
                    fWide: BOOL(1),
                },
            );
            ptr::copy_nonoverlapping(
                wide_path.as_ptr(),
                pointer.cast::<u8>().add(header_size).cast::<u16>(),
                wide_path.len(),
            );
            let _ = GlobalUnlock(hglobal);
            Ok(hglobal)
        }
    }

    #[implement(IEnumFORMATETC)]
    struct FormatEtcEnumerator {
        formats: Vec<FORMATETC>,
        index: Mutex<usize>,
    }

    impl FormatEtcEnumerator {
        fn new(formats: Vec<FORMATETC>) -> Self {
            Self {
                formats,
                index: Mutex::new(0),
            }
        }
    }

    #[allow(non_snake_case)]
    impl windows::Win32::System::Com::IEnumFORMATETC_Impl for FormatEtcEnumerator_Impl {
        fn Next(&self, count: u32, output: *mut FORMATETC, fetched: *mut u32) -> HRESULT {
            if output.is_null() {
                return E_INVALIDARG;
            }
            let Ok(mut index) = self.index.lock() else {
                return E_INVALIDARG;
            };
            let mut written = 0_u32;
            while written < count && *index < self.formats.len() {
                unsafe {
                    output.add(written as usize).write(self.formats[*index]);
                }
                *index += 1;
                written += 1;
            }
            if !fetched.is_null() {
                unsafe {
                    *fetched = written;
                }
            }
            if written == count {
                S_OK
            } else {
                S_FALSE
            }
        }

        fn Skip(&self, count: u32) -> Result<()> {
            let mut index = self
                .index
                .lock()
                .map_err(|_| Error::from_hresult(E_INVALIDARG))?;
            *index = (*index + count as usize).min(self.formats.len());
            Ok(())
        }

        fn Reset(&self) -> Result<()> {
            let mut index = self
                .index
                .lock()
                .map_err(|_| Error::from_hresult(E_INVALIDARG))?;
            *index = 0;
            Ok(())
        }

        fn Clone(&self) -> Result<IEnumFORMATETC> {
            let index = self
                .index
                .lock()
                .map_err(|_| Error::from_hresult(E_INVALIDARG))?;
            Ok(FormatEtcEnumerator {
                formats: self.formats.clone(),
                index: Mutex::new(*index),
            }
            .into())
        }
    }

    fn hdrop_format_etc() -> FORMATETC {
        FORMATETC {
            cfFormat: 15,
            ptd: ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        }
    }
}
