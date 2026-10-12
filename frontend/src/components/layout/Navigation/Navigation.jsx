import React from 'react';
import styles from './Navigation.module.css';
import Button from '../../ui/Button';

const Navigation = ({ currentPage, onPageChange, isConnected, account, onConnect }) => {
  const pages = [
    { id: 'browse', label: 'Browse Notes', icon: '📚' },
    { id: 'create', label: 'Create Note', icon: '✏️' },
    { id: 'my-notes', label: 'My Notes', icon: '📝' },
    { id: 'test', label: 'Test Contract', icon: '🔧' }
  ];

  const formatAccount = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <nav className={styles.navigation}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <span className={styles.logo}>📚</span>
          <span className={styles.title}>NotesMarketplace</span>
        </div>
        
        <div className={styles.menu}>
          {pages.map((page) => (
            <Button
              key={page.id}
              variant={currentPage === page.id ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => onPageChange(page.id)}
              className={styles.navButton}
            >
              <span className={styles.icon}>{page.icon}</span>
              <span className={styles.label}>{page.label}</span>
            </Button>
          ))}
        </div>
        
        <div className={styles.actions}>
          {isConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                background: '#ecfdf5',
                color: '#059669',
                border: '1px solid #a7f3d0',
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                🟢 Sepolia
              </span>
              <Button
                variant="ghost"
                size="sm"
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontWeight: '600'
                }}
              >
                👤 {formatAccount(account)}
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={onConnect}
            >
              🔗 Connect Wallet
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
