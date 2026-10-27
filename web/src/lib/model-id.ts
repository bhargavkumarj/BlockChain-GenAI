/**
 * OpenRouter names Anthropic models `anthropic/claude-opus-5.5`; Anthropic's own API calls the same model
 * `claude-opus-5-5`. AI_MODEL and AI_JUROR_MODELS accept either form, so switching provider never means
 * renaming models. An id that already has a vendor prefix is used as is.
 */
export function openRouterModelId(model: string) {
  if (model.includes("/")) return model;
  return `anthropic/${model.replace(/-(\d+)-(\d{1,2})$/, "-$1.$2")}`;
}
