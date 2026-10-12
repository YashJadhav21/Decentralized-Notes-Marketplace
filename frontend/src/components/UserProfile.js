import React, { useState, useEffect } from 'react';
import styles from './UserProfile.module.css';
import { useNotesContract } from '../hooks/useNotesContract';
import { useWeb3 } from '../contexts/Web3Context';
import Header from './layout/Header';
import NoteRatingWidget from './NoteRatingWidget';

function UserProfile({ addNotification, onNavigate }) {
  const { getMyNotes, getUserPurchases, getAuthorEarnings, withdrawEarnings } = useNotesContract();
  const { state, connectWallet } = useWeb3();
  
  const [myNotes, setMyNotes] = useState([]);
  const [purchasedNotes, setPurchasedNotes] = useState([]);
  const [earnings, setEarnings] = useState('0');
  const [stats, setStats] = useState({
    totalSales: 0,
    totalEarnings: '0',
    totalRatings: 0,
    averageRating: 0,
    totalDownloads: 0
  });
  // Default directly to 'mynotes' tab so user sees their uploaded notes immediately!
  const [activeTab, setActiveTab] = useState('mynotes');
  const [isLoading, setIsLoading] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  useEffect(() => {
    if (state.isConnected && state.account) {
      loadUserData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isConnected, state.account]);

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch user's created notes from blockchain
      const userNotes = await getMyNotes(state.account);
      setMyNotes(userNotes || []);

      // 2. Fetch user's purchased notes
      const userPurchases = await getUserPurchases(state.account);
      setPurchasedNotes(userPurchases || []);

      // 3. Fetch user's on-chain sales earnings
      const authorEarnings = await getAuthorEarnings(state.account);
      setEarnings(authorEarnings || '0');

      // 4. Calculate stats
      const notesList = userNotes || [];
      const totalDownloads = notesList.reduce((sum, n) => sum + (Number(n.downloadCount) || 0), 0);
      const totalRatings = notesList.reduce((sum, n) => sum + (Number(n.ratingCount) || 0), 0);
      const totalRatingSum = notesList.reduce((sum, n) => sum + ((Number(n.rating) || 0) * (Number(n.ratingCount) || 0)), 0);
      const averageRating = totalRatings > 0 ? (totalRatingSum / totalRatings).toFixed(1) : '0';

      setStats({
        totalSales: totalDownloads,
        totalEarnings: authorEarnings || '0',
        totalRatings,
        averageRating,
        totalDownloads
      });
    } catch (error) {
      console.error('Error loading user data:', error);
      if (addNotification) {
        addNotification({
          type: 'error',
          message: 'Failed to load user profile: ' + error.message
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdrawEarnings = async () => {
    if (parseFloat(earnings) <= 0) return;
    try {
      setIsWithdrawing(true);
      const receipt = await withdrawEarnings();
      alert(`🎉 Earnings withdrawn successfully! Tx: ${receipt.hash.slice(0, 10)}...`);
      setEarnings('0');
      loadUserData();
    } catch (error) {
      console.error('Withdraw failed:', error);
      alert(`❌ Withdrawal failed: ${error.message || error}`);
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleCopyAddress = () => {
    if (state.account) {
      navigator.clipboard.writeText(state.account);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!state.isConnected) {
    return (
      <div className={styles.profileContainer}>
        <div className={styles.disconnectedCard}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🦊</div>
          <h2>Connect Your Wallet</h2>
          <p style={{ color: '#64748b', margin: '0.5rem 0 1.5rem 0' }}>
            Connect your MetaMask wallet to view your created study notes, manage sales, and track earnings on Sepolia.
          </p>
          <button onClick={connectWallet} className={styles.createButton}>
            Connect MetaMask
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.profileContainer}>
      {/* Page Header */}
      <Header
        title="📝 My Notes & Dashboard"
        subtitle="Manage your minted notes, download files from IPFS, and view marketplace analytics"
      >
        <button
          onClick={loadUserData}
          disabled={isLoading}
          className={styles.tabButton}
          style={{ background: '#ffffff', border: '1px solid #cbd5e1' }}
        >
          {isLoading ? '🔄 Refreshing...' : '🔄 Refresh Data'}
        </button>
      </Header>

      {/* Account Info Banner */}
      <div className={styles.accountBanner}>
        <div className={styles.accountHeader}>
          <div className={avatarAndInfoClass}>
            <div className={styles.avatarCircle}>👤</div>
            <div className={styles.accountDetails}>
              <h2>
                {formatAddress(state.account)}
                <button
                  onClick={handleCopyAddress}
                  style={{
                    fontSize: '0.8rem',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '0.2rem 0.5rem',
                    cursor: 'pointer',
                    color: '#475569'
                  }}
                  title="Copy full address"
                >
                  {copiedAddress ? '✅ Copied!' : '📋 Copy'}
                </button>
              </h2>
              <div className={styles.badgesRow}>
                <span className={`${styles.badge} ${styles.badgeNetwork}`}>
                  🌐 Sepolia Testnet
                </span>
                <span className={`${styles.badge} ${styles.badgeBalance}`}>
                  💰 Balance: {parseFloat(state.balance || '0').toFixed(4)} ETH
                </span>
                <span className={`${styles.badge} ${styles.badgeEarnings}`}>
                  💵 Unclaimed: {parseFloat(earnings).toFixed(4)} ETH
                </span>
              </div>
            </div>
          </div>

          <div className={styles.withdrawSection}>
            <button
              onClick={handleWithdrawEarnings}
              disabled={parseFloat(earnings) <= 0 || isWithdrawing}
              className={styles.withdrawButton}
              title={parseFloat(earnings) <= 0 ? 'No earnings available to withdraw yet' : 'Withdraw earnings to your wallet'}
            >
              {isWithdrawing ? '⏳ Withdrawing...' : `💸 Withdraw (${parseFloat(earnings).toFixed(4)} ETH)`}
            </button>
          </div>
        </div>
      </div>

      {/* 4 Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={`${styles.statIconBox} ${styles.statNotes}`}>📝</div>
          <div>
            <div className={styles.statValue}>{myNotes.length}</div>
            <div className={styles.statLabel}>Notes Created</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIconBox} ${styles.statDownloads}`}>📥</div>
          <div>
            <div className={styles.statValue}>{stats.totalDownloads}</div>
            <div className={styles.statLabel}>Total Downloads</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIconBox} ${styles.statRating}`}>⭐</div>
          <div>
            <div className={styles.statValue}>{stats.averageRating} / 5</div>
            <div className={styles.statLabel}>Avg Rating ({stats.totalRatings} reviews)</div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIconBox} ${styles.statEarnings}`}>💰</div>
          <div>
            <div className={styles.statValue}>{parseFloat(earnings).toFixed(4)} ETH</div>
            <div className={styles.statLabel}>Available Earnings</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className={styles.tabsContainer}>
        <button
          onClick={() => setActiveTab('mynotes')}
          className={`${styles.tabButton} ${activeTab === 'mynotes' ? styles.activeTab : ''}`}
        >
          <span>📝 My Created Notes</span>
          <span className={styles.tabCountBadge}>{myNotes.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('purchased')}
          className={`${styles.tabButton} ${activeTab === 'purchased' ? styles.activeTab : ''}`}
        >
          <span>🛒 Purchased Notes</span>
          <span className={styles.tabCountBadge}>{purchasedNotes.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`${styles.tabButton} ${activeTab === 'analytics' ? styles.activeTab : ''}`}
        >
          <span>📊 Overview & Analytics</span>
        </button>
      </div>

      {/* Tab 1: My Created Notes */}
      {activeTab === 'mynotes' && (
        <div>
          {isLoading ? (
            <div className={styles.loadingBox}>
              <span className={styles.spinner}>🔄</span>
              <p style={{ color: '#64748b', fontWeight: '500' }}>Loading your notes from Sepolia blockchain...</p>
            </div>
          ) : myNotes.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📚</div>
              <h3>No study notes uploaded yet</h3>
              <p>You haven't uploaded any study notes yet. Mint your first note as an NFT to start earning ETH!</p>
              <button onClick={() => onNavigate ? onNavigate('create') : null} className={styles.createButton}>
                ✏️ Go to Create Note
              </button>
            </div>
          ) : (
            <div className={styles.notesGrid}>
              {myNotes.map((note) => (
                <div key={note.id} className={styles.noteCard}>
                  <div>
                    <div className={styles.cardTop}>
                      <h3 className={styles.noteTitle}>{note.title || `Note #${note.id}`}</h3>
                      <span className={styles.priceBadge}>{note.price} ETH</span>
                    </div>

                    {note.subject && (
                      <span className={styles.subjectBadge}>
                        🏷️ {note.subject}
                      </span>
                    )}

                    <p className={styles.noteDescription}>
                      {note.description || 'No description provided.'}
                    </p>

                    <div className={styles.noteMetaRow}>
                      <span className={styles.metaItem}>
                        📥 {note.downloadCount || 0} downloads
                      </span>
                      <span className={styles.metaItem}>
                        ⭐ {note.rating || 0} ★ ({note.ratingCount || 0})
                      </span>
                      <span className={note.forSale ? styles.saleStatusListed : styles.saleStatusUnlisted}>
                        {note.forSale ? '🟢 For Sale' : '🔴 Unlisted'}
                      </span>
                    </div>
                  </div>

                  <div className={styles.cardActions}>
                    {note.ipfsHash && (
                      <a
                        href={`https://gateway.pinata.cloud/ipfs/${note.ipfsHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.ipfsDownloadBtn}
                      >
                        📥 View & Download File (IPFS)
                      </a>
                    )}
                    <a
                      href={`https://sepolia.etherscan.io/address/0x147BCC3949C855758b589647d7CdA83F75E65694`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.etherscanLink}
                    >
                      🔍 Verified on Sepolia Etherscan (ID #{note.id})
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Purchased Notes */}
      {activeTab === 'purchased' && (
        <div>
          {purchasedNotes.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🛒</div>
              <h3>No purchased notes yet</h3>
              <p>Explore the marketplace to discover study notes from top creators and purchase them with SepoliaETH.</p>
              <button
                onClick={() => onNavigate ? onNavigate('browse') : null}
                className={styles.createButton}
              >
                📚 Browse Marketplace
              </button>
            </div>
          ) : (
            <div className={styles.notesGrid}>
              {purchasedNotes.map((note) => (
                <div key={note.id} className={styles.noteCard}>
                  <div>
                    <div className={styles.cardTop}>
                      <h3 className={styles.noteTitle}>{note.title}</h3>
                      <span className={styles.priceBadge}>{note.price} ETH</span>
                    </div>

                    {note.subject && (
                      <span className={styles.subjectBadge}>🏷️ {note.subject}</span>
                    )}

                    <p className={styles.noteDescription}>{note.description}</p>
                  </div>

                  <div className={styles.cardActions}>
                    {note.ipfsHash && (
                      <a
                        href={`https://gateway.pinata.cloud/ipfs/${note.ipfsHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.ipfsDownloadBtn}
                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                      >
                        📥 Access & Download Full File
                      </a>
                    )}
                    <NoteRatingWidget
                      tokenId={note.id}
                      account={state.account}
                      onRated={loadUserData}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Analytics & Overview */}
      {activeTab === 'analytics' && (
        <div className={styles.analyticsContainer}>
          <div className={styles.analyticsCard}>
            <h3>🎯 Subject Distribution</h3>
            {myNotes.length === 0 ? (
              <p style={{ color: '#64748b' }}>Upload notes across subjects to view analytics.</p>
            ) : (
              <div className={styles.subjectList}>
                {Object.entries(
                  myNotes.reduce((acc, n) => {
                    if (n.subject) {
                      acc[n.subject] = (acc[n.subject] || 0) + 1;
                    }
                    return acc;
                  }, {})
                ).map(([subject, count]) => (
                  <div key={subject} className={styles.subjectItem}>
                    <span>📚 {subject}</span>
                    <span className={styles.subjectCountBadge}>{count} note{count > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.analyticsCard}>
            <h3>🏆 Creator Milestones</h3>
            <div className={styles.achievementList}>
              {myNotes.length >= 1 && (
                <div className={styles.achievementItem}>
                  <span>✅</span>
                  <div>
                    <div><strong>First Note Minted!</strong></div>
                    <small style={{ color: '#15803d' }}>You published your first note to the blockchain.</small>
                  </div>
                </div>
              )}
              {myNotes.length >= 5 ? (
                <div className={styles.achievementItem}>
                  <span>🌟</span>
                  <div>
                    <div><strong>Prolific Creator</strong></div>
                    <small>Minted 5 or more study notes.</small>
                  </div>
                </div>
              ) : (
                <div className={styles.achievementItem} style={{ background: '#f8fafc', borderColor: '#e2e8f0', color: '#64748b' }}>
                  <span>🔒</span>
                  <div>
                    <div><strong>Prolific Creator ({myNotes.length}/5)</strong></div>
                    <small>Mint 5 notes to unlock this milestone.</small>
                  </div>
                </div>
              )}
              <div className={styles.achievementItem} style={{ background: '#f8fafc', borderColor: '#e2e8f0', color: '#64748b' }}>
                <span>🔒</span>
                <div>
                  <div><strong>Top Seller ({stats.totalDownloads}/10)</strong></div>
                  <small>Reach 10 downloads to unlock.</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const avatarAndInfoClass = styles.avatarAndInfo;

export default UserProfile;
