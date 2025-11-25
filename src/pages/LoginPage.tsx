import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

// Interface para as props do Input
interface InputFieldProps {
  label: string;
  type: string;
  placeholder: string;
  icon: React.ElementType; // Aceita um componente React (o ícone)
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({ label, type, placeholder, icon: Icon, id, value, onChange, required = true }) => (
  <div className="form-group">
    <label htmlFor={id} className="form-label">{label}</label>
    <div className="input-wrapper">
      <div className="input-icon"><Icon size={18} /></div>
      <input 
        type={type} 
        id={id} 
        className="form-input" 
        placeholder={placeholder} 
        value={value} 
        onChange={onChange} 
        required={required} 
      />
    </div>
  </div>
);

export default function LoginPage() {
  const navigate = useNavigate();
  const [animate, setAnimate] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAnimate(true);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Autentica o usuário
      const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // 2. Verifica a "Role" no Banco de Dados
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        if (userData.role === 'creator') {
          navigate('/creator-dashboard');
        } else if (userData.role === 'clipper') {
          navigate('/clipper-dashboard');
        } else if (userData.role === 'admin') {
          navigate('/admin-dashboard');
        } else {
          setError("Erro: Seu usuário não tem um perfil definido.");
        }
      } else {
        setError("Erro: Usuário sem registro no banco de dados.");
      }

    } catch (err: any) { // 'any' para acessar propriedades de erro do Firebase
      console.error("Erro no login:", err);
      
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError("E-mail ou senha incorretos.");
      } else if (err.message && (err.message.includes("network") || err.message.includes("failed to fetch"))) {
        setError("Erro de conexão. Verifique se algum AdBlock está bloqueando o banco de dados.");
      } else {
        setError("Ocorreu um erro ao entrar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app auth-page">
      <div className="hero-bg-wrapper">
        <img
          src="https://media.istockphoto.com/id/1405608734/vector/glowing-neon-lines-tunnel-led-arcade-stage-abstract-technology-background-virtual-reality.jpg?s=612x612&w=0&k=20&c=6qvHGCesp7DYYkYLUlBI1f_JnWQWsQDutY769MYLPu0="
          alt="Background"
          className="hero-bg-img"
          style={{ opacity: 0.1 }}
        />
        <div className="hero-bg-overlay"></div>
      </div>

      <header className="header" style={{ position: 'absolute', background: 'transparent', border: 'none' }}>
        <div className="container nav-container" style={{ display: 'flex', justifyContent: 'center' }}>
          <Link to="/" className="logo" style={{ textDecoration: 'none' }}>
            <Icons.Play fill="url(#gradient)" size={28} />
            Clipay
          </Link>
        </div>
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <linearGradient id="gradient" x1="100%" y1="100%" x2="0%" y2="0%">
            <stop stopColor="#3b82f6" offset="0%" />
            <stop stopColor="#8b5cf6" offset="100%" />
          </linearGradient>
        </svg>
      </header>

      <div className="container auth-container">
        <div className={`auth-card ${animate ? 'fade-in-up' : ''}`}>
          <div className="auth-header">
            <h1>Bem-vindo de volta!</h1>
            <p>Acesse seu dashboard para gerenciar ganhos e cortes.</p>
          </div>

          {error && (
            <div style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <form className="auth-form" onSubmit={handleLogin}>
            <InputField
              id="email"
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              icon={Icons.Mail}
              value={formData.email}
              onChange={handleChange}
            />
            <InputField
              id="password"
              label="Senha"
              type="password"
              placeholder="••••••••"
              icon={Icons.Lock}
              value={formData.password}
              onChange={handleChange}
            />

            <a href="#" className="forgot-password">
              Esqueceu sua senha?
            </a>

            <button 
              className="btn btn-primary btn-block btn-lg"
              disabled={loading}
            >
              {loading ? 'Verificando Perfil...' : 'Entrar na Plataforma'}
              {!loading && <Icons.ArrowRight size={20} style={{ marginLeft: '8px' }} />}
            </button>

            <div className="auth-divider">
              <span>Ou entre com</span>
            </div>

            <button type="button" className="btn btn-outline btn-block social-btn">
              <Icons.Google size={20} />
              Google
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Ainda não tem uma conta?{' '}
              <Link to="/signup" className="link-highlight">
                Criar conta grátis
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}