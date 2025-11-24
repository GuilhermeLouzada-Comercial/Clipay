import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

export default function PrivateRoute({ children, requiredRole }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Busca o documento do usuário no Firestore para saber a Role
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          setRole(userDoc.data().role);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0b0b0f', color: 'white' }}>
        Carregando...
      </div>
    );
  }

  // 1. Se não tiver usuário logado, manda pro login
  if (!user) {
    return <Navigate to="/login" />;
  }

  // 2. Se tiver uma role obrigatória (ex: 'creator') e o usuário não tiver essa role, bloqueia
  if (requiredRole && role !== requiredRole) {
    // Poderia ser uma página de "Acesso Negado"
    return <Navigate to="/" />; 
  }

  // Se passou por tudo, mostra a página
  return children;
}