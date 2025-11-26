import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

// Tipos
type UserRole = 'creator' | 'clipper';

interface InputFieldProps {
  label: string;
  type: string;
  placeholder: string;
  icon: React.ElementType;
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({ label, type, placeholder, icon: Icon, id, value, onChange, required = true }) => (
  <div className="form-group">
    <label htmlFor={id} className="form-label">
      {label}
    </label>
    <div className="input-wrapper">
      <div className="input-icon">
        <Icon size={18} />
      </div>
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

export default function SignupPage() {
  const navigate = useNavigate();
  // Tipamos o estado activeRole
  const [activeRole, setActiveRole] = useState<UserRole>('creator');
  const [animate, setAnimate] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setAnimate(true);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.id]: e.target.value
    });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validação básica de senha
    if (formData.password !== formData.confirmPassword) {
      setError("As senhas não coincidem.");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
        setError("A senha deve ter pelo menos 6 caracteres.");
        setLoading(false);
        return;
    }

    try {
      // 1. Cria o usuário na Autenticação do Firebase
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        formData.email, 
        formData.password
      );
      const user = userCredential.user;

      // 2. Atualiza o perfil do usuário com o Nome
      await updateProfile(user, {
        displayName: formData.name
      });

      // 3. Salva os dados extras no Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: formData.name,
        email: formData.email,
        role: activeRole,
        createdAt: serverTimestamp(),
        pixKey: "", 
        xp: 0,
        views: 0,
        videos: 0,
      });

      console.log("Conta criada com sucesso:", user.uid);
      
      // Redirecionamento baseado na role escolhida
      if (activeRole === 'creator') {
        navigate('/creator-dashboard');
      } else {
        navigate('/clipper-dashboard');
      }

    } catch (err: any) {
      console.error("Erro ao criar conta:", err);
      
      if (err.code === 'auth/email-already-in-use') {
        setError("Este e-mail já está sendo usado.");
      } else if (err.code === 'auth/invalid-email') {
        setError("E-mail inválido.");
      } else {
        setError("Ocorreu um erro ao criar a conta. Tente novamente.");
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

      <header
        className="header"
        style={{
          position: 'absolute',
          background: 'transparent',
          border: 'none',
        }}
      >
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
            <h1>Crie sua conta</h1>
            <p>
              Junte-se ao ecossistema que está revolucionando o mercado de
              cortes.
            </p>
          </div>

          <div className="role-selector-wrapper">
            <div className="role-switch">
              <button
                className={`role-btn ${
                  activeRole === 'creator' ? 'active' : ''
                }`}
                onClick={() => setActiveRole('creator')}
                type="button"
              >
                Sou Criador
              </button>
              <button
                className={`role-btn ${
                  activeRole === 'clipper' ? 'active' : ''
                }`}
                onClick={() => setActiveRole('clipper')}
                type="button"
              >
                Sou Clipador
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSignup}>
            <InputField
              id="name"
              label="Nome Completo"
              type="text"
              placeholder="Como você quer ser chamado?"
              icon={Icons.User}
              value={formData.name}
              onChange={handleChange}
            />
            <InputField
              id="email"
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              icon={Icons.Mail}
              value={formData.email}
              onChange={handleChange}
            />

            <div className="form-row">
              <InputField
                id="password"
                label="Senha"
                type="password"
                placeholder="••••••••"
                icon={Icons.Lock}
                value={formData.password}
                onChange={handleChange}
              />
              <InputField
                id="confirmPassword"
                label="Confirmar Senha"
                type="password"
                placeholder="••••••••"
                icon={Icons.Lock}
                value={formData.confirmPassword}
                onChange={handleChange}
              />
            </div>

            <button
              className="btn btn-primary btn-block btn-lg"
              style={{ marginTop: '20px' }}
              disabled={loading}
            >
              {loading ? 'Criando conta...' : 'Criar Conta Grátis'}
              {!loading && <Icons.ArrowRight size={20} style={{ marginLeft: '8px' }} />}
            </button>

            <div className="auth-divider">
              <span>Ou continue com</span>
            </div>
            <button type="button" className="btn btn-outline btn-block social-btn">
              <Icons.Google size={20} /> Entrar com Google
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Já tem uma conta?{' '}
              <Link to="/login" className="link-highlight">
                Fazer Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}