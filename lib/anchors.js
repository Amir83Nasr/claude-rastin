'use strict';

// Class-name prefixes the webview integration selects, e.g. `[class*="root_"]`.
// Claude Code's CSS modules append a hash (`root_-a7MRw`), so only the prefix
// is stable across builds. When one of these disappears, the rules that
// select it stop matching and RTL fails silently, so the patch step checks
// the bundle for them.
const ANCHORS = [
  'actionButton_',
  'answerText_',
  'buttonContainer_',
  'codeBlockWrapper_',
  'content_',
  'copyButton_',
  'diffEditorWrapper_',
  'errorMessage_',
  'iconButton_',
  'insightFooter_',
  'insightHeader_',
  'keyboardHints_',
  'markdownPlain_',
  'mentionMirror_',
  'messageInput_',
  'navTab_',
  'optionContent_',
  'optionDescription_',
  'optionHighlighted_',
  'optionLabel_',
  'optionText_',
  'otherInput_',
  'permissionRequestContent_',
  'permissionRequestDescription_',
  'permissionRequestHeader_',
  'permissionRequestInput_',
  'placeholder_',
  'previewBody_',
  'previewCaption_',
  'questionBlock_',
  'questionHeader_',
  'questionTextLarge_',
  'rejectMessageInput_',
  'root_',
  'spinnerRow_',
  'thinkingContainer_',
  'thinkingContent_',
  'thinkingHeader_',
  'todoItem_',
  'toolBody',
  'toolResult_',
  'toolSummary_',
  'toolUse_',
  'userMessage_',
  'userMessageAttachments',
  'userMessageContainer_',
];

// The anchors that carry the core RTL behavior. A bundle that lacks one of
// these is a bundle Rastin does not understand, so only these warn the user.
// The rest are optional: several are absent from the Claude Code builds
// checked so far (answerText_, thinkingContainer_, thinkingHeader_).
const CORE_ANCHORS = [
  'codeBlockWrapper_',
  'messageInput_',
  'permissionRequestHeader_',
  'questionTextLarge_',
  'root_',
  'todoItem_',
  'toolUse_',
  'userMessage_',
];

/**
 * @param {string} css the bundle's index.css
 * @param {readonly string[]} [anchors] defaults to every anchor
 * @returns {string[]} the anchors that never appear in the stylesheet
 */
function missingAnchors(css, anchors = ANCHORS) {
  return anchors.filter((anchor) => !css.includes(`.${anchor}`));
}

module.exports = { ANCHORS, CORE_ANCHORS, missingAnchors };
