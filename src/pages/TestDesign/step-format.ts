/**
 * Formats simple authored Jira actions to the shared step grammar used by the
 * launcher. This is presentation-time normalization only; the engine validates
 * and normalizes the saved draft again.
 */
export function normalizeTestDesignStep(value: string): string {
  const text = value.trim();
  if (!text || /\b(?:y|luego|despu[eé]s|si|cuando|and|then|if|when)\b|[;{}<>]/i.test(text)) return text;

  const click = text.match(/^(presionar|precionar|pulsar|hacer clic en|clic en|click on|press)\s+(?:(?:el|la|the)\s+)?(?:(?:bot[oó]n|button|enlace|link|pestaña|tab)\s+)?(.+?)[.]?$/i);
  if (click) {
    const target = click[2].trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim();
    if (target && !/["“”'‘’\r\n]/.test(target)) {
      const verb = /^(?:presionar|precionar)$/i.test(click[1]) ? 'Presionar' : click[1];
      return `${verb} "${target}"`;
    }
    return text;
  }

  // Quote only a plainly named destination field. Keep values, existing quotes,
  // compound steps, and authored sentence punctuation untouched.
  const fill = text.match(/^(ingresar|escribir|digitar|introducir|llenar|completar)\s+(.+?)\s+en\s+(?:(?:el|la)\s+)?(?:campo\s+)?([^\s"“”'‘’]+(?:\s+[^\s"“”'‘’]+){0,3})[.]?$/i);
  if (fill && !/["“”'‘’]/.test(fill[2]) && !/[.!?]$/.test(fill[3])) {
    const label = fill[3].trim();
    if (label) return `${fill[1]} ${fill[2].trim()} en "${label[0].toLocaleUpperCase()}${label.slice(1)}"`;
  }

  // A one-word fill instruction in the editor is shorthand for entering data
  // in the field with that name. Avoid guessing a field from longer prose.
  const bareFill = text.match(/^(ingresar|escribir|digitar|introducir|llenar|completar)\s+(?:(?:el|la|un|una)\s+)?([\p{L}\p{N}_-]+)[.]?$/iu);
  if (bareFill && !/^(?:al|a|abrir|acceder|entrar|iniciar|sesion|sesi[oó]n)$/i.test(bareFill[2])) {
    const label = bareFill[2];
    return `${bareFill[1]} ${label} en "${label[0].toLocaleUpperCase()}${label.slice(1)}"`;
  }

  const assertion = text.match(/^(?:validar|verificar)\s+que\s+se\s+(muestre|muestren|presente|presenten|vea|vean)\s+(.+?)[.]?$/i);
  if (assertion && !/["“”'‘’]/.test(assertion[2])) {
    return `Validar que se ${assertion[1].toLowerCase()} "${assertion[2].trim()}"`;
  }
  return text;
}
