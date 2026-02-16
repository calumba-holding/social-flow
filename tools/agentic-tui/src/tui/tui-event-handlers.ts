export interface ShortcutHandlers {
  onHelpToggle: () => void;
  onRefresh: () => void;
  onDetails: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onToggleRail: () => void;
  onPaletteToggle: () => void;
  onConfirm: () => void;
  onReplayUp: () => void;
  onReplayDown: () => void;
  onQuit: () => void;
}

export function handleShortcut(
  input: string,
  key: { ctrl?: boolean; return?: boolean; upArrow?: boolean; downArrow?: boolean; escape?: boolean },
  hasReplaySuggestions: boolean,
  handlers: ShortcutHandlers
): boolean {
  if (key.ctrl && input === "c") {
    handlers.onQuit();
    return true;
  }
  if (input === "q") {
    handlers.onQuit();
    return true;
  }
  if (input === "?") {
    handlers.onHelpToggle();
    return true;
  }
  if (input === "u") {
    handlers.onRefresh();
    return true;
  }
  if (input === "d") {
    handlers.onDetails();
    return true;
  }
  if (input === "e") {
    handlers.onEdit();
    return true;
  }
  if (input === "a") {
    handlers.onApprove();
    return true;
  }
  if (input === "r") {
    handlers.onReject();
    return true;
  }
  if (input === "x") {
    handlers.onToggleRail();
    return true;
  }
  if (input === "/") {
    handlers.onPaletteToggle();
    return true;
  }
  if (hasReplaySuggestions && key.upArrow) {
    handlers.onReplayUp();
    return true;
  }
  if (hasReplaySuggestions && key.downArrow) {
    handlers.onReplayDown();
    return true;
  }
  if (key.return) {
    handlers.onConfirm();
    return true;
  }
  return false;
}

