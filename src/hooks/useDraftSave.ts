import {
  type CompositionEvent,
  type FocusEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSaveFlash } from "./useSaveFlash";

type DraftElement = HTMLInputElement | HTMLTextAreaElement;

export type DraftParseResult<T> =
  | { ok: true; value: T; displayValue?: string }
  | { ok: false };

export interface UseDraftSaveOptions<T> {
  scopeKey: string;
  value: T;
  format: (value: T) => string;
  parse: (draft: string) => DraftParseResult<T>;
  onCommit: (scopeKey: string, value: T) => void;
  equals?: (left: T, right: T) => boolean;
  commitOnEnter?: boolean;
  debounceMs?: number;
  flushOnUnmount?: boolean;
  shouldCommitOnBlur?: (event: FocusEvent<DraftElement>) => boolean;
}

export function useDraftSave<T>({
  scopeKey,
  value,
  format,
  parse,
  onCommit,
  equals = Object.is,
  commitOnEnter = false,
  debounceMs,
  flushOnUnmount = false,
  shouldCommitOnBlur = () => true,
}: UseDraftSaveOptions<T>) {
  const [draft, setDraftState] = useState(() => format(value));
  const [invalid, setInvalid] = useState(false);
  const draftRef = useRef(draft);
  const baselineRef = useRef({ scopeKey, value });
  const focusedRef = useRef(false);
  const composingRef = useRef(false);
  const pendingBlurRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const formatRef = useRef(format);
  const parseRef = useRef(parse);
  const onCommitRef = useRef(onCommit);
  const equalsRef = useRef(equals);
  const shouldCommitOnBlurRef = useRef(shouldCommitOnBlur);
  const { visible: saved, flash, reset: resetFlash } = useSaveFlash();
  const flashRef = useRef(flash);
  const resetFlashRef = useRef(resetFlash);

  formatRef.current = format;
  parseRef.current = parse;
  onCommitRef.current = onCommit;
  equalsRef.current = equals;
  shouldCommitOnBlurRef.current = shouldCommitOnBlur;
  flashRef.current = flash;
  resetFlashRef.current = resetFlash;

  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const commitDraft = useCallback((
    expectedScope: string,
    updateUi = true,
    allowComposing = false,
  ) => {
    clearTimer();
    const baseline = baselineRef.current;
    if (
      baseline.scopeKey !== expectedScope
      || (composingRef.current && !allowComposing)
    ) return false;

    const parsed = parseRef.current(draftRef.current);
    if (!parsed.ok) {
      if (updateUi) setInvalid(true);
      return false;
    }

    const displayValue = parsed.displayValue ?? formatRef.current(parsed.value);
    if (equalsRef.current(parsed.value, baseline.value)) {
      if (updateUi && displayValue !== draftRef.current) {
        draftRef.current = displayValue;
        setDraftState(displayValue);
      }
      if (updateUi) setInvalid(false);
      return false;
    }

    onCommitRef.current(expectedScope, parsed.value);
    baselineRef.current = { scopeKey: expectedScope, value: parsed.value };
    draftRef.current = displayValue;
    if (updateUi) {
      setDraftState(displayValue);
      setInvalid(false);
      flashRef.current();
    }
    return true;
  }, [clearTimer]);

  const scheduleDebounce = useCallback(() => {
    clearTimer();
    if (debounceMs === undefined || composingRef.current) return;
    const expectedScope = baselineRef.current.scopeKey;
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      commitDraft(expectedScope);
    }, debounceMs);
  }, [clearTimer, commitDraft, debounceMs]);

  useEffect(() => {
    const cleanupScope = scopeKey;
    return () => {
      clearTimer();
      if (flushOnUnmount) commitDraft(cleanupScope, false, true);
    };
  }, [clearTimer, commitDraft, flushOnUnmount, scopeKey]);

  useEffect(() => {
    const previous = baselineRef.current;
    const scopeChanged = previous.scopeKey !== scopeKey;
    const parsedDraft = parseRef.current(draftRef.current);
    const draftWasClean = parsedDraft.ok
      && equalsRef.current(parsedDraft.value, previous.value);

    baselineRef.current = { scopeKey, value };
    if (scopeChanged) {
      composingRef.current = false;
      pendingBlurRef.current = false;
      resetFlashRef.current();
    }
    if (scopeChanged || !focusedRef.current || draftWasClean) {
      const nextDraft = formatRef.current(value);
      draftRef.current = nextDraft;
      setDraftState(nextDraft);
      setInvalid(false);
    }
  }, [scopeKey, value]);

  function setDraft(nextDraft: string) {
    draftRef.current = nextDraft;
    setDraftState(nextDraft);
    setInvalid(false);
    scheduleDebounce();
  }

  function onFocus() {
    focusedRef.current = true;
  }

  function onBlur(event: FocusEvent<DraftElement>) {
    focusedRef.current = false;
    if (!shouldCommitOnBlurRef.current(event)) {
      clearTimer();
      pendingBlurRef.current = false;
      return;
    }
    const nativeEvent = event.nativeEvent as typeof event.nativeEvent & {
      isComposing?: boolean;
    };
    if (composingRef.current || nativeEvent.isComposing) {
      pendingBlurRef.current = true;
      return;
    }
    commitDraft(scopeKey);
  }

  function onCompositionStart() {
    composingRef.current = true;
    clearTimer();
  }

  function onCompositionEnd(event: CompositionEvent<DraftElement>) {
    composingRef.current = false;
    draftRef.current = event.currentTarget.value;
    setDraftState(event.currentTarget.value);
    if (pendingBlurRef.current) {
      pendingBlurRef.current = false;
      commitDraft(scopeKey);
      return;
    }
    scheduleDebounce();
  }

  function onKeyDown(event: KeyboardEvent<DraftElement>) {
    if (!commitOnEnter || event.key !== "Enter" || event.shiftKey) return;
    if (
      composingRef.current
      || event.nativeEvent.isComposing
      || event.nativeEvent.keyCode === 229
    ) return;

    event.preventDefault();
    commitDraft(scopeKey);
    event.currentTarget.blur();
  }

  return {
    draft,
    invalid,
    saved,
    setDraft,
    commit: () => commitDraft(scopeKey),
    inputProps: {
      onFocus,
      onBlur,
      onCompositionStart,
      onCompositionEnd,
      onKeyDown,
    },
  };
}
