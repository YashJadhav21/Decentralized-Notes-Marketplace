import React, { useState, useEffect } from 'react';
import styles from './BrowsePage.module.css';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Header from '../../components/layout/Header';
import { notesContract } from '../../contractConnection';
import NoteRatingWidget from '../../components/NoteRatingWidget';

const BrowsePage = ({ contract, account }) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  useEffect(() => {
    loadNotes();
  }, [account]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const allNotes = await notesContract.getAllNotes();
      const notesData = await Promise.all((allNotes || []).map(async (n) => {
        let hasPurchased = false;
        if (account && n.id !== undefined) {
          try {
            hasPurchased = await notesContract.hasUserPurchased(account, n.id);
          } catch (e) {
            console.warn('hasUserPurchased check error:', e);
          }
        }
        return {
          id: n.id,
          title: n.title,
          description: n.description,
          subject: n.subject,
          ipfsHash: n.ipfsHash,
          owner: n.author,
          price: n.price,
          forSale: n.forSale,
          hasPurchased,
          available: n.forSale && (n.author?.toLowerCase() !== account?.toLowerCase()) && !hasPurchased,
          isOwner: n.author?.toLowerCase() === account?.toLowerCase(),
          rating: n.averageRating || 0,
          downloadCount: n.downloadCount || 0
        };
      }));
      setNotes(notesData);
    } catch (error) {
      console.error('Error loading notes in BrowsePage:', error);
    } finally {
      setLoading(false);
    }
  };

  const buyNote = async (noteId, price) => {
    try {
      await notesContract.purchaseNote(noteId, price);
      await loadNotes();
      alert('🎉 Note purchased successfully!');
    } catch (error) {
      console.error('Error purchasing note:', error);
      alert('Failed to purchase note: ' + (error.reason || error.message));
    }
  };

  const filteredNotes = notes.filter(note => {
    const search = searchTerm.toLowerCase();
    return (
      (note.title && note.title.toLowerCase().includes(search)) ||
      (note.subject && note.subject.toLowerCase().includes(search)) ||
      (note.description && note.description.toLowerCase().includes(search))
    );
  });

  const sortedNotes = [...filteredNotes].sort((a, b) => {
    switch (sortBy) {
      case 'price-low':
        return parseFloat(a.price) - parseFloat(b.price);
      case 'price-high':
        return parseFloat(b.price) - parseFloat(a.price);
      case 'recent':
      default:
        return Number(b.id) - Number(a.id);
    }
  });

  return (
    <div className={styles.browsePage}>
      <Header
        title="Browse Notes"
        subtitle="Discover and purchase study notes verified on the blockchain"
      >
        <Button onClick={loadNotes} disabled={loading}>
          {loading ? '🔄 Loading...' : '🔄 Refresh'}
        </Button>
      </Header>

      <div className={styles.filters}>
        <div className={styles.searchSection}>
          <Input
            type="text"
            placeholder="Search by title, subject, or topic..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon="🔍"
          />
        </div>
        
        <div className={styles.sortSection}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className={styles.sortSelect}
          >
            <option value="recent">Most Recent</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <Card>
            <div className={styles.loadingContent}>
              <span className={styles.spinner}>🔄</span>
              <p>Loading notes from blockchain...</p>
            </div>
          </Card>
        </div>
      ) : (
        <div className={styles.notesGrid}>
          {sortedNotes.length === 0 ? (
            <Card className={styles.emptyState}>
              <div className={styles.emptyContent}>
                <span className={styles.emptyIcon}>📚</span>
                <h3>No notes found</h3>
                <p>No study notes found yet. Go to <strong>Create Note</strong> to upload your first note!</p>
              </div>
            </Card>
          ) : (
            sortedNotes.map((note) => (
              <Card key={note.id} className={styles.noteCard}>
                <div className={styles.noteHeader}>
                  <h3 className={styles.noteTitle}>{note.title || `Note #${note.id}`}</h3>
                  <span className={styles.notePrice}>
                    {note.price} ETH
                  </span>
                </div>
                
                <div className={styles.noteContent}>
                  {note.subject && (
                    <p style={{ margin: '4px 0', color: '#3b82f6', fontWeight: 'bold' }}>
                      🏷️ {note.subject}
                    </p>
                  )}
                  {note.description && (
                    <p style={{ margin: '6px 0', color: '#4b5563', fontSize: '0.9rem' }}>
                      {note.description}
                    </p>
                  )}
                  {note.isOwner || note.hasPurchased ? (
                    note.ipfsHash && (
                      <p style={{ margin: '4px 0', fontSize: '0.8rem', color: '#059669' }}>
                        📁 <a 
                          href={`https://gateway.pinata.cloud/ipfs/${note.ipfsHash}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#059669', textDecoration: 'underline', fontWeight: '500' }}
                        >
                          Access Full File on IPFS
                        </a>
                      </p>
                    )
                  ) : (
                    <p style={{ margin: '4px 0', fontSize: '0.8rem', color: '#64748b' }}>
                      🔒 Full document locked — Purchase to access
                    </p>
                  )}
                  <p className={styles.noteOwner}>
                    👤 Author: {note.owner?.slice(0, 6)}...{note.owner?.slice(-4)}
                  </p>
                </div>
                
                <div className={styles.noteActions}>
                  {note.isOwner ? (
                    <Button variant="ghost" size="sm" disabled>
                      ✅ Your Note
                    </Button>
                  ) : note.hasPurchased ? (
                    <div style={{ width: '100%' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                        padding: '6px 12px',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        borderRadius: '8px'
                      }}>
                        <span style={{ color: '#065f46', fontWeight: 'bold', fontSize: '0.85rem' }}>
                          ✅ Purchased & Owned
                        </span>
                        {note.ipfsHash && (
                          <a
                            href={`https://gateway.pinata.cloud/ipfs/${note.ipfsHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#047857',
                              fontWeight: '600',
                              fontSize: '0.85rem',
                              textDecoration: 'underline'
                            }}
                          >
                            📥 Open File
                          </a>
                        )}
                      </div>
                      <NoteRatingWidget
                        tokenId={note.id}
                        account={account}
                        onRated={loadNotes}
                      />
                    </div>
                  ) : note.available ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => buyNote(note.id, note.price)}
                      className={styles.buyButton}
                    >
                      💰 Buy for {note.price} ETH
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled>
                      ❌ Not for sale
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default BrowsePage;
