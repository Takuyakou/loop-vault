//! WebView2 microphone permission (P5.17-05).
//!
//! Production Tauri runs in WebView2, which denies `getUserMedia` unless the
//! host answers the permission request. Record & Compare only calls
//! `getUserMedia` after the user explicitly enables recording, so auto-allowing
//! the microphone permission here matches the user's intent while the OS still
//! governs the underlying device access.
//!
//! Written defensively: every failure is ignored, so the worst case is that no
//! handler is installed and the web layer falls back to its permission-denied
//! state (Bass Practice stays fully usable). It never panics on the webview path.
//!
//! Runtime behaviour is verified on the target Windows machine during hardware
//! acceptance; this module only needs to compile cleanly here.

#[cfg(windows)]
pub fn install(webview: tauri::webview::PlatformWebview) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2PermissionRequestedEventArgs,
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;

    let core: ICoreWebView2 = match unsafe { webview.controller().CoreWebView2() } {
        Ok(core) => core,
        Err(_) => return,
    };

    let handler = PermissionRequestedEventHandler::create(Box::new(
        |_sender: Option<ICoreWebView2>,
         args: Option<ICoreWebView2PermissionRequestedEventArgs>|
         -> windows::core::Result<()> {
            if let Some(args) = args {
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                if unsafe { args.PermissionKind(&mut kind) }.is_ok()
                    && kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                {
                    let _ = unsafe { args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW) };
                }
            }
            Ok(())
        },
    ));

    let mut token = Default::default();
    let _ = unsafe { core.add_PermissionRequested(&handler, &mut token) };
}

#[cfg(not(windows))]
pub fn install(_webview: tauri::webview::PlatformWebview) {
    // Non-Windows webviews (WKWebView/WebKitGTK) prompt or grant natively; the
    // web layer handles the outcome.
}
