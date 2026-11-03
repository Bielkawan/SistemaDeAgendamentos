import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import logo from "../../assets/logo.webp";
import { errorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { FormError } from "../../components/Modal";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/admin";
  if (user) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try { await login(email.trim(), password); navigate(from, { replace: true }); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }

  return <div className="auth-page"><div className="auth-card">
    <div className="brand"><div className="brand-logo"><img src={logo} alt="" /></div><div><strong>NR Studio</strong><span>NAILS & BROWS</span></div></div>
    <span className="eyebrow">ÁREA RESTRITA</span>
    <h1>Entrar no painel</h1>
    <p>Acesso exclusivo da administração do studio.</p>
    <form onSubmit={submit}>
      <FormError message={error} />
      <label>E-mail<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Senha<input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button className="primary-button" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
    </form>
  </div></div>;
}
