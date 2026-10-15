import type { Metadata } from "next";
import { Suspense } from "react";
import { configMissing } from "@/lib/supabase";
import { signOut } from "./actions";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Mototaxi" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="login">
      <div className="card stack">
        <div>
          <p className="eyebrow">Mototaxi · Panel</p>
          <h1>Entrar</h1>
        </div>
        {configMissing ? (
          <ConfigMissing />
        ) : (
          <Suspense fallback={<LoginForm />}>
            <Reason searchParams={searchParams} />
          </Suspense>
        )}
      </div>
    </main>
  );
}

async function Reason({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { motivo } = await searchParams;
  if (motivo !== "no-admin") return <LoginForm />;
  return (
    <div className="stack">
      <p className="error" role="alert">Esta cuenta no es de administrador.</p>
      <p className="muted">Entra con otro número o pide que te den el rol de administrador.</p>
      <form action={signOut}>
        <button className="btn">Salir y usar otro número</button>
      </form>
    </div>
  );
}

function ConfigMissing() {
  return (
    <div className="stack">
      <p className="error">Falta conectar el panel con Supabase.</p>
      <p className="muted">
        Copia <code>apps/panel/.env.example</code> a <code>apps/panel/.env.local</code>, pon la URL y la anon key de tu
        proyecto y reinicia <code>npm run panel</code>.
      </p>
    </div>
  );
}
