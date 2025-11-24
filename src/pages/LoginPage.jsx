import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';

const InputField = ({ label, type, placeholder, icon: Icon, id }) => (
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
      />
    </div>
  </div>
);

export default function LoginPage() {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setAnimate(true);
  }, []);

  return (
    <div className="app auth-page">
      <div className="hero-bg-wrapper">
        <img
          src="[https://media.istockphoto.com/id/1405608734/vector/glowing-neon-lines-tunnel-led-arcade-stage-abstract-technology-background-virtual-reality.jpg?s=612x612&w=0&k=20&c=6qvHGCesp7DYYkYLUlBI1f_JnWQWsQDutY769MYLPu0=](https://media.istockphoto.com/id/1405608734/vector/glowing-neon-lines-tunnel-led-arcade-stage-abstract-technology-background-virtual-reality.jpg?s=612x612&w=0&k=20&c=6qvHGCesp7DYYkYLUlBI1f_JnWQWsQDutY769MYLPu0=)"
          alt="Background"
          className="hero-bg-img"
          style={{ opacity: 0.1 }}
        />
        <div className="hero-bg-overlay"></div>
      </div>

      {/* Header Simples com Link para Home */}
      <header
        className="header"
        style={{
          position: 'absolute',
          background: 'transparent',
          border: 'none',
        }}
      >
        <div className="container nav-container">
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

          <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
            <InputField
              id="email"
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              icon={Icons.Mail}
            />
            <InputField
              id="password"
              label="Senha"
              type="password"
              placeholder="••••••••"
              icon={Icons.Lock}
            />

            <a href="#" className="forgot-password">
              Esqueceu sua senha?
            </a>

            <button className="btn btn-primary btn-block btn-lg">
              Entrar na Plataforma
              <Icons.ArrowRight size={20} style={{ marginLeft: '8px' }} />
            </button>

            <div className="auth-divider">
              <span>Ou entre com</span>
            </div>

            <button className="btn btn-outline btn-block social-btn">
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
