let lastSelectionFeedbackAt = 0

export function triggerSelectionFeedback() {
  if (typeof window === "undefined") return

  const now = Date.now()
  if (now - lastSelectionFeedbackAt < 90) return
  lastSelectionFeedbackAt = now

  const vibrate = window.navigator?.vibrate
  if (typeof vibrate !== "function") return

  try {
    vibrate.call(window.navigator, 12)
  } catch {
    // Some browsers expose vibrate but block it depending on context.
  }
}
