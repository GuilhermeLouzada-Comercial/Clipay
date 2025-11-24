import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- COMPONENTES ---

const Header = () => (
  <header className="header">
    <div className="container nav-container">
      <Link to="/">
        <div className="logo">
          <Icons.Play fill={'url(#gradient)'} size={28} />
          Clipay
        </div>
      </Link>
      <nav className="nav-links">
        <a href="#features" className="nav-link">
          Funcionalidades
        </a>
        <a href="#roles" className="nav-link">
          Para Quem?
        </a>
        <a href="#pricing" className="nav-link">
          Preços
        </a>
      </nav>
      <div className="nav-buttons">
        <Link to="/login">
          <button className="btn btn-outline hide-mobile">Login</button>
        </Link>
        <Link to="/signup">
          <button className="btn btn-primary">Começar Agora</button>
        </Link>
      </div>
    </div>

    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <linearGradient id="gradient" x1="100%" y1="100%" x2="0%" y2="0%">
        <stop stopColor="#3b82f6" offset="0%" />
        <stop stopColor="#8b5cf6" offset="100%" />
      </linearGradient>
    </svg>
  </header>
);

const DashboardPreview = ({ role }) => {
  const [hoveredBar, setHoveredBar] = useState(null);

  const data = {
    creator: {
      title: 'Dashboard Criador de Conteúdo',
      mainLabel: 'Saldo da Campanha',
      mainValue: 'R$145.250,00',
      btnText: '+ Nova Campanha',
      stats: [
        { val: '+27.4M', label: 'Views Totais', color: 'var(--success)' },
        { val: '842', label: 'Vídeos Aprovados', color: 'white' },
        { val: '156', label: 'Clipadores Ativos', color: 'white' },
      ],
      graphLabel: 'Visualizações Semanais',
      graphColor: 'var(--gradient-main)',
      getTooltip: (height) => `${(height / 15).toFixed(1)}M Views`,
    },
    clipper: {
      title: 'Dashboard do Clipador',
      mainLabel: 'Disponível para Saque',
      mainValue: 'R$15.850,00',
      btnText: 'Solicitar Pix',
      stats: [
        { val: '#1', label: 'Ranking Campanha', color: 'var(--warning)' },
        { val: '42', label: 'Vídeos Postados', color: 'white' },
        { val: 'R$750', label: 'Bônus Hoje', color: 'var(--success)' },
      ],
      graphLabel: 'Ganhos Semanais',
      graphColor: 'var(--gradient-clipper)',
      getTooltip: (height) => `R$ ${(height * 9).toFixed(0)},00`,
    },
  };

  const current = data[role];
  const barHeights = [40, 60, 45, 70, 50, 80, 65, 90, 75, 100];

  return (
    <div className="dashboard-preview">
      <div className="dash-title-bar">
        <div className="dash-indicator"></div>
        {current.title + ' #' + getRandomInt(1000, 99999)}
      </div>

      <div className="dash-header">
        <div>
          <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
            {current.mainLabel}
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>
            {current.mainValue}
          </div>
        </div>
        <button
          className="btn btn-primary dash-action-btn"
          style={{ padding: '5px 15px', fontSize: '0.8rem', cursor: 'default' }}
        >
          {current.btnText}
        </button>
      </div>

      <div className="dash-stats">
        {current.stats.map((stat, index) => (
          <div key={index} className="stat-box">
            <div className="stat-val" style={{ color: stat.color }}>
              {stat.val}
            </div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="graph-container">
        <div className="graph-label">{current.graphLabel}</div>
        <div
          style={{
            height: '150px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '10px',
          }}
        >
          {barHeights.map((height, i) => (
            <div
              key={i}
              className="bar-interactive"
              onMouseEnter={() => setHoveredBar(i)}
              onMouseLeave={() => setHoveredBar(null)}
              style={{
                width: '100%',
                height: role === 'clipper' ? `${height * 0.8}%` : `${height}%`,
                background: current.graphColor,
                opacity: 0.3 + i * 0.07,
                borderRadius: '4px 4px 0 0',
                transition: 'all 0.3s ease',
                position: 'relative',
                cursor: 'pointer',
              }}
            >
              {hoveredBar === i && (
                <div className="chart-tooltip">
                  {current.getTooltip(height)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Hero = ({ activeRole, setActiveRole }) => (
  <section className="hero">
    <div className="hero-bg-wrapper">
      <img
        src="https://media.istockphoto.com/id/1405608734/vector/glowing-neon-lines-tunnel-led-arcade-stage-abstract-technology-background-virtual-reality.jpg?s=612x612&w=0&k=20&c=6qvHGCesp7DYYkYLUlBI1f_JnWQWsQDutY769MYLPu0="
        alt="Abstract Neon Background"
        className="hero-bg-img"
      />
      <div className="hero-bg-overlay"></div>
    </div>

    <div className="container">
      <div className="hero-tag">Plataforma Beta - Acesso Antecipado</div>
      <h1 className="hero-title">
        O Fim da Desorganização <br />
        <span>No Mundo dos Cortes</span>
      </h1>
      <p className="hero-subtitle">
        Integramos Criadores e Clipadores em um único ecossistema. Sem taxas de
        adm, sem planilhas manuais e pagamentos automatizados.
      </p>

      <div className="hero-buttons">
        <button
          className={
            activeRole === 'creator' ? 'btn btn-active-role' : 'btn btn-outline'
          }
          onClick={() => setActiveRole('creator')}
          style={{ fontWeight: 'bold', minWidth: '200px' }}
        >
          Sou Criador de Conteúdo
        </button>
        <button
          className={
            activeRole === 'clipper' ? 'btn btn-active-role' : 'btn btn-outline'
          }
          onClick={() => setActiveRole('clipper')}
          style={{ fontWeight: 'bold', minWidth: '200px' }}
        >
          Sou Clipador
        </button>
      </div>

      <DashboardPreview role={activeRole} />
    </div>
  </section>
);

const RolesSection = ({ activeRole, setActiveRole }) => {
  const creatorFeatures = [
    {
      Icon: Icons.BarChart3,
      title: 'ROI em Tempo Real',
      desc: 'Saiba exatamente quanto cada visualização está custando e o retorno sobre investimento da sua campanha.',
    },
    {
      Icon: Icons.Wallet,
      title: 'Pagamentos Centralizados',
      desc: 'Esqueça fazer 50 PIX manuais. Deposite um valor único e nós distribuímos conforme as metas.',
    },
    {
      Icon: Icons.ShieldCheck,
      title: 'Controle de Qualidade',
      desc: 'Aprove ou rejeite vídeos antes do pagamento ser liberado. Defina regras claras de monetização.',
    },
  ];

  const clipperFeatures = [
    {
      Icon: Icons.Trophy,
      title: 'Rankings Competitivos',
      desc: 'Visualize sua posição no ranking global e da campanha. Gamificação real para aumentar seus ganhos.',
    },
    {
      Icon: Icons.LineChart,
      title: 'Previsibilidade',
      desc: 'Saiba exatamente quanto vai receber e quando. Um dashboard claro com suas metas de views e vídeos.',
    },
    {
      Icon: Icons.CheckCircle,
      title: 'Pagamento Garantido',
      desc: 'O dinheiro do criador já está na plataforma. Cumpriu a meta? O saldo é liberado para sua carteira.',
    },
  ];

  const currentFeatures =
    activeRole === 'creator' ? creatorFeatures : clipperFeatures;

  return (
    <section id="roles" className="section">
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '2.5rem', marginBottom: '20px' }}>
            Feito para o Ecossistema
          </h2>
          <div className="role-switch">
            <button
              className={`role-btn ${activeRole === 'creator' ? 'active' : ''}`}
              onClick={() => setActiveRole('creator')}
            >
              Para Criadores
            </button>
            <button
              className={`role-btn ${activeRole === 'clipper' ? 'active' : ''}`}
              onClick={() => setActiveRole('clipper')}
            >
              Para Clipadores
            </button>
          </div>
        </div>

        <div className="features-grid">
          {currentFeatures.map((feature, index) => (
            <div key={index} className="feature-card">
              <div className="feature-icon">
                <feature.Icon size={28} />
              </div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-desc">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const comparisonData = [
  {
    resource: 'Taxa de Organização',
    bad: 'Paga ao ADM/Mod',
    good: 'R$ 0,00 (Isento)',
  },
  {
    resource: 'Pagamentos',
    bad: 'Manual (Um por um)',
    good: 'Automático / PIX em lote',
  },
  {
    resource: 'Transparência',
    bad: 'Planilhas confusas',
    good: 'Dashboard em Tempo Real',
  },
  {
    resource: 'Segurança',
    bad: 'Confiança verbal',
    good: 'Valor retido (Escrow)',
  },
];

const ComparisonSection = () => (
  <section className="section" style={{ background: 'var(--bg-card)' }}>
    <div className="container">
      <h2
        style={{
          textAlign: 'center',
          fontSize: '2.5rem',
          marginBottom: '50px',
        }}
      >
        A Evolução do Mercado
      </h2>

      <div className="comparison-desktop">
        <div style={{ overflowX: 'auto' }}>
          <table className="comparison-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Recurso</th>
                <th style={{ width: '35%' }} className="col-header">
                  Modelo Atual (Discord)
                </th>
                <th style={{ width: '35%' }} className="col-header brand">
                  Clipay
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((item, i) => (
                <tr key={i}>
                  <td>{item.resource}</td>
                  <td style={{ color: 'var(--danger)' }}>{item.bad}</td>
                  <td style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                    {item.good}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="comparison-mobile">
        {comparisonData.map((item, i) => (
          <div key={i} className="comp-card">
            <div className="comp-title">{item.resource}</div>

            <div className="comp-row">
              <div className="comp-label" style={{ color: 'var(--danger)' }}>
                <Icons.XCircle size={18} color="var(--danger)" />
                Discord
              </div>
              <div style={{ textAlign: 'right', color: '#9ca3af' }}>
                {item.bad}
              </div>
            </div>

            <div className="comp-row">
              <div className="comp-label" style={{ color: 'var(--success)' }}>
                <Icons.CheckCircle size={18} color="var(--success)" />
                Clipay
              </div>
              <div style={{ textAlign: 'right', fontWeight: 'bold' }}>
                {item.good}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Footer = () => {
  const date = new Date();
  return (
    <footer className="footer">
      <div className="container">
        <div
          className="logo"
          style={{ justifyContent: 'center', marginBottom: '20px' }}
        >
          <Icons.Play fill="var(--primary)" size={24} />
          Clipay
        </div>
        <div
          className="nav-links"
          style={{
            justifyContent: 'center',
            gap: '20px',
            marginBottom: '30px',
          }}
        >
          <a href="#" className="nav-link">
            Termos de Uso
          </a>
          <a href="#" className="nav-link">
            Política de Privacidade
          </a>
          <a href="#" className="nav-link">
            Suporte
          </a>
        </div>
        <p className="footer-text">
          &copy; {date.getFullYear()} Clipay Tecnologia. Todos os direitos
          reservados.
          <br />
          Conectando criadores e impulsionando conteúdos.
        </p>
      </div>
    </footer>
  );
};

export default function LandingPage() {
  const [activeRole, setActiveRole] = useState('creator');

  return (
    <div className="app">
      <Header />
      <Hero activeRole={activeRole} setActiveRole={setActiveRole} />
      <RolesSection activeRole={activeRole} setActiveRole={setActiveRole} />
      <ComparisonSection />

      <section className="section container" style={{ textAlign: 'center' }}>
        <div
          style={{
            background: 'var(--gradient-main)',
            padding: '60px',
            borderRadius: '20px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', zIndex: 2 }}>
            <h2
              style={{
                fontSize: '2.5rem',
                marginBottom: '20px',
                color: 'white',
              }}
            >
              Pronto para escalar?
            </h2>
            <p
              style={{
                marginBottom: '30px',
                color: 'rgba(255,255,255,0.9)',
                fontSize: '1.1rem',
              }}
            >
              Junte-se a centenas de criadores e clipadores que já estão
              profissionalizando o mercado.
            </p>
            <Link to="/signup">
              <button
                className="btn"
                style={{
                  background: 'white',
                  color: 'var(--primary)',
                  padding: '15px 40px',
                  fontSize: '1.1rem',
                }}
              >
                Criar Conta Grátis
              </button>
            </Link>
          </div>
          <div
            style={{
              position: 'absolute',
              top: '-50%',
              right: '-10%',
              width: '400px',
              height: '400px',
              background: 'white',
              opacity: '0.1',
              borderRadius: '50%',
            }}
          ></div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
