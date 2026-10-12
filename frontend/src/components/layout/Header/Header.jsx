import React from 'react';
import styles from './Header.module.css';

const Header = ({ title, subtitle, children }) => {
  return (
    <div className={styles.headerCard}>
      <div className={styles.textSection}>
        {title && <h1 className={styles.title}>{title}</h1>}
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {children && (
        <div className={styles.actions}>
          {children}
        </div>
      )}
    </div>
  );
};

export default Header;
