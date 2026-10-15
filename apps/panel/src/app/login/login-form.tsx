"use client";

import { formatPhone } from "@mototaxi/shared";
import { useActionState, useState } from "react";
import { sendCode, verifyCode, type LoginState } from "./actions";

export function LoginForm() {
  const [phoneState, requestCode, sending] = useActionState(sendCode, { step: "phone" } as LoginState);
  const [codeState, checkCode, checking] = useActionState(verifyCode, { step: "code" } as LoginState);
  // Permite volver a escribir el número después de pedir el código
  const [editingPhone, setEditingPhone] = useState(false);

  const askingCode = phoneState.step === "code" && !editingPhone;
  const phone = codeState.phone ?? phoneState.phone ?? "";

  if (!askingCode) {
    return (
      <form action={(fd) => { setEditingPhone(false); requestCode(fd); }} className="stack">
        <label className="field">
          <span>Celular</span>
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="300 123 4567"
                 defaultValue={phone ? formatPhone(phone) : ""} required autoFocus />
        </label>
        {phoneState.error && <p className="error" role="alert">{phoneState.error}</p>}
        <button className="btn primary" disabled={sending}>{sending ? "Enviando…" : "Enviarme el código"}</button>
      </form>
    );
  }

  return (
    <form action={checkCode} className="stack">
      <input type="hidden" name="phone" value={phone} />
      <p className="muted">
        Si {formatPhone(phone)} es una cuenta registrada, te llegó un SMS con un código de 6 dígitos.
      </p>
      <label className="field">
        <span>Código</span>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}"
               placeholder="123456" required autoFocus />
      </label>
      {codeState.error && <p className="error" role="alert">{codeState.error}</p>}
      <button className="btn primary" disabled={checking}>{checking ? "Revisando…" : "Entrar"}</button>
      <button type="button" className="btn link" onClick={() => setEditingPhone(true)}>Cambiar número</button>
    </form>
  );
}
