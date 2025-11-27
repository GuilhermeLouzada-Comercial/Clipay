import React from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';

export default function NotFoundPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-dark)',
      color: 'var(--text-main)',
      textAlign: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        padding: '40px',
        borderRadius: '20px',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
        maxWidth: '500px',
        width: '100%'
      }}>
        <div style={{ 
          fontSize: '4rem', 
          fontWeight: 'bold', 
          background: 'var(--gradient-main)', 
          WebkitBackgroundClip: 'text', 
          WebkitTextFillColor: 'transparent',
          marginBottom: '20px'
        }}>
          404
        </div>
        
        <h2 style={{ marginBottom: '15px', fontSize: '1.5rem' }}>Página não encontrada</h2>
        
        <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>
          Ops! Parece que a página que você está procurando não existe ou foi movida.
        </p>

        <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <Icons.ArrowRight style={{ transform: 'rotate(180deg)' }} size={20} />
          Voltar para o Início
        </Link>
      </div>
    </div>
  );
}