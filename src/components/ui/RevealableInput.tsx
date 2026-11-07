import { useState, type InputHTMLAttributes } from 'react';
import { Eye } from 'lucide-react';

/**
 * Un <input> que, cuando es de tipo contraseña, trae un check (con un ojo) para ver el valor que
 * contiene dentro de la herramienta. Se usa igual que un <input>: solo cambia el wrapper.
 * El check no lleva texto visible a propósito: varias pantallas envuelven el campo en un <label>
 * y listan su texto; el nombre accesible va en aria-label/title.
 */
export function RevealableInput({ type, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const [revealed, setRevealed] = useState(false);
  if (type !== 'password') return <input type={type} {...rest} />;
  return (
    <div className="w-full min-w-0">
      <input type={revealed ? 'text' : 'password'} {...rest} />
      <span className="mt-1 inline-flex items-center gap-1 text-[10px] opacity-75" title="Mostrar valor">
        <input
          type="checkbox"
          checked={revealed}
          onChange={(event) => setRevealed(event.target.checked)}
          aria-label="Mostrar valor"
          className="h-3 w-3 cursor-pointer"
        />
        <Eye size={11} aria-hidden="true" />
      </span>
    </div>
  );
}
