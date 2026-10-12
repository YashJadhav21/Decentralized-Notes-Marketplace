import React, { useState, useEffect, useCallback } from 'react';
import styles from './CreatePage.module.css';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Header from '../../components/layout/Header';
import IPFSFileUpload from '../../components/IPFSFileUpload';
import { notesContract } from '../../contractConnection';

const CreatePage = ({ contract, account, onNavigate }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    content: '',
    subject: '',
    price: '0.01'
  });
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [notification, setNotification] = useState(null);
  const [lastCreatedNote, setLastCreatedNote] = useState(null);
  const [existingNotes, setExistingNotes] = useState([]);
  const [copyrightViolation, setCopyrightViolation] = useState(null);

  // Pre-load all notes currently on the blockchain
  const loadExistingNotes = useCallback(async () => {
    try {
      const notes = await notesContract.getAllNotes();
      setExistingNotes(notes || []);
    } catch (err) {
      console.warn('Could not preload existing notes for copyright check:', err);
    }
  }, []);

  useEffect(() => {
    loadExistingNotes();
  }, [loadExistingNotes, account]);

  // Run real-time copyright & duplicate check whenever file or title changes
  useEffect(() => {
    const checkCopyright = async () => {
      if (!existingNotes || existingNotes.length === 0) {
        setCopyrightViolation(null);
        return;
      }

      const fileHash = uploadedFile?.hash ? uploadedFile.hash.trim().toLowerCase() : '';
      const inputTitle = formData.title ? formData.title.trim().toLowerCase() : '';

      if (!fileHash && !inputTitle) {
        setCopyrightViolation(null);
        return;
      }

      // Check if file hash or title matches any existing on-chain note
      const matched = existingNotes.find(n => {
        if (!n) return false;
        const noteHash = n.ipfsHash ? n.ipfsHash.trim().toLowerCase() : '';
        const noteTitle = n.title ? n.title.trim().toLowerCase() : '';

        const hashMatch = fileHash && noteHash && noteHash === fileHash;
        const titleMatch = inputTitle && noteTitle && noteTitle === inputTitle;
        return hashMatch || titleMatch;
      });

      if (matched) {
        const userAddress = (account || '').toLowerCase();
        const isOwn = matched.author && matched.author.toLowerCase() === userAddress;
        let isPurchased = false;

        if (userAddress && !isOwn) {
          try {
            isPurchased = await notesContract.hasUserPurchased(userAddress, matched.id);
          } catch (e) {
            console.warn('hasUserPurchased check error:', e);
          }
        }

        const isFileMatch = Boolean(fileHash && matched.ipfsHash && matched.ipfsHash.trim().toLowerCase() === fileHash);

        setCopyrightViolation({
          isDuplicate: true,
          note: matched,
          isOwn,
          isPurchased,
          matchType: isFileMatch ? 'file' : 'title'
        });
      } else {
        setCopyrightViolation(null);
      }
    };

    checkCopyright();
  }, [uploadedFile, formData.title, existingNotes, account]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileUploaded = (fileData) => {
    setUploadedFile(fileData);
    console.log('📁 File uploaded to IPFS:', fileData);
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 6000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Strict Copyright & Duplicate Check
    if (copyrightViolation && copyrightViolation.isDuplicate) {
      if (copyrightViolation.isPurchased) {
        showNotification(
          `🚨 Copyright Violation: You purchased this note ("${copyrightViolation.note.title}") from author ${copyrightViolation.note.author.slice(0,6)}...${copyrightViolation.note.author.slice(-4)}. Re-uploading or reselling other creators' study materials is strictly prohibited!`,
          'error'
        );
      } else if (copyrightViolation.isOwn) {
        showNotification(
          `⚠️ Duplicate Note: You have already uploaded note #${copyrightViolation.note.id} ("${copyrightViolation.note.title}").`,
          'warning'
        );
      } else {
        showNotification(
          `🚨 Copyright Infringement: This note has already been registered on the blockchain by original author ${copyrightViolation.note.author.slice(0,6)}...${copyrightViolation.note.author.slice(-4)} (Note #${copyrightViolation.note.id}).`,
          'error'
        );
      }
      return;
    }
    
    if (!formData.title || !formData.description || !formData.subject) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    // Check if file is uploaded for better user experience
    if (!uploadedFile) {
      const confirmWithoutFile = window.confirm(
        'No file has been uploaded to IPFS. Do you want to create a text-only note? For best results, upload a file containing your study materials.'
      );
      if (!confirmWithoutFile) return;
    }

    setLoading(true);
    
    try {
      console.log('🚀 Creating note with the following data:', {
        title: formData.title,
        description: formData.description,
        subject: formData.subject,
        price: formData.price,
        hasFile: !!uploadedFile,
        fileHash: uploadedFile?.hash
      });

      // Use the IPFS hash from uploaded file, or create a fallback
      let ipfsHash;
      
      if (uploadedFile) {
        // Use the actual IPFS hash from the uploaded file
        ipfsHash = uploadedFile.hash;
        showNotification('Using uploaded file from IPFS', 'info');
      } else {
        // Create a dummy IPFS hash for text-only notes
        ipfsHash = 'QmTextOnly' + Date.now();
        showNotification('Creating text-only note (no file uploaded)', 'warning');
      }

      // Create metadata URI (required 6th parameter)
      const metadata = {
        title: formData.title,
        description: formData.description,
        content: formData.content,
        subject: formData.subject,
        ipfsHash: ipfsHash,
        createdAt: new Date().toISOString(),
        hasUploadedFile: !!uploadedFile,
        type: uploadedFile ? 'file-note' : 'text-note'
      };
      const metadataURI = `data:application/json;base64,${btoa(JSON.stringify(metadata))}`;

      console.log('📝 Calling notesContract.createNote function...');
      console.log('Parameters:', {
        title: formData.title,
        description: formData.description,
        ipfsHash: ipfsHash,
        price: formData.price,
        subject: formData.subject,
        metadataURI: metadataURI.substring(0, 50) + '...'
      });

      // Use the same working logic as the Test Contract page
      const receipt = await notesContract.createNote(
        formData.title,
        formData.description,
        ipfsHash,
        parseFloat(formData.price), // This will be converted to wei in the contract function
        formData.subject,
        metadataURI
      );

      showNotification('Transaction submitted to blockchain...', 'info');
      console.log('⏳ Transaction submitted:', receipt.hash);
      
      setLastCreatedNote({
        txHash: receipt.hash,
        title: formData.title,
        ipfsHash: ipfsHash,
        price: formData.price
      });

      showNotification(
        `🎉 Note created successfully! Transaction: ${receipt.hash.slice(0, 10)}...`,
        'success'
      );
      
      // Reset form
      setFormData({
        title: '',
        description: '',
        content: '',
        subject: '',
        price: '0.01'
      });
      setUploadedFile(null);
      
    } catch (error) {
      console.error('💥 Error creating note:', error);
      
      let errorMessage = 'Failed to create note. ';
      if (error.message.includes('user rejected')) {
        errorMessage += 'Transaction was rejected by user.';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage += 'Insufficient funds for transaction.';
      } else if (error.message.includes('gas')) {
        errorMessage += 'Gas estimation failed. Check network connection.';
      } else {
        errorMessage += error.message;
      }
      
      showNotification(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.createPage}>
      <Header
        title="Create Note"
        subtitle="Share your knowledge and earn from your notes"
      />

      {lastCreatedNote && (
        <Card style={{ marginBottom: '20px', border: '2px solid #10b981', backgroundColor: '#f0fdf4', padding: '16px' }}>
          <div>
            <h3 style={{ color: '#065f46', margin: '0 0 8px 0' }}>
              🎉 Note "{lastCreatedNote.title}" Successfully Minted on Blockchain!
            </h3>
            <p style={{ color: '#047857', margin: '0 0 12px 0', fontSize: '0.95rem' }}>
              Your note has been minted as an NFT on Ethereum Sepolia. You can find it under the <strong>📚 Browse Notes</strong> tab in the marketplace, or in <strong>📝 My Notes</strong>.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onNavigate ? onNavigate('browse') : null}
              >
                📚 View in Browse Notes
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigate ? onNavigate('my-notes') : null}
              >
                📝 View in My Notes
              </Button>
              <a 
                href={`https://sepolia.etherscan.io/tx/${lastCreatedNote.txHash}`} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: '#2563eb', fontWeight: 'bold', textDecoration: 'underline', fontSize: '0.9rem', marginLeft: '6px' }}
              >
                🔍 Sepolia Etherscan
              </a>
              {lastCreatedNote.ipfsHash && (
                <a 
                  href={`https://gateway.pinata.cloud/ipfs/${lastCreatedNote.ipfsHash}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: '#059669', fontWeight: 'bold', textDecoration: 'underline', fontSize: '0.9rem', marginLeft: '6px' }}
                >
                  📁 IPFS File
                </a>
              )}
            </div>
          </div>
        </Card>
      )}

      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          <span className={styles.notificationIcon}>
            {notification.type === 'success' ? '✅' : 
             notification.type === 'error' ? '❌' : 
             notification.type === 'warning' ? '⚠️' : 'ℹ️'}
          </span>
          <span>{notification.message}</span>
          <button 
            className={styles.closeNotification}
            onClick={() => setNotification(null)}
          >
            ✕
          </button>
        </div>
      )}

      {copyrightViolation && copyrightViolation.isDuplicate && (
        <Card style={{
          marginBottom: '20px',
          border: '2px solid #ef4444',
          backgroundColor: '#fef2f2',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)'
        }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '2rem' }}>🚨</span>
            <div style={{ flex: 1 }}>
              <h3 style={{ color: '#991b1b', margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 'bold' }}>
                {copyrightViolation.isPurchased 
                  ? '⚠️ Copyright Violation: Re-uploading Purchased Note Prohibited'
                  : copyrightViolation.isOwn 
                    ? '⚠️ Duplicate Note: You Have Already Uploaded This Note' 
                    : '🚨 Copyright Infringement: Note Already Registered on Blockchain'}
              </h3>
              <p style={{ color: '#b91c1c', margin: '0 0 12px 0', fontSize: '0.95rem', lineHeight: '1.5' }}>
                {copyrightViolation.isPurchased ? (
                  <>
                    You purchased and downloaded this study material (<strong>"{copyrightViolation.note.title}"</strong>) from original creator <code>{copyrightViolation.note.author.slice(0,6)}...{copyrightViolation.note.author.slice(-4)}</code>. Re-uploading or claiming other creators' intellectual property is strictly prohibited by academic integrity rules.
                  </>
                ) : copyrightViolation.isOwn ? (
                  <>
                    You have already uploaded this exact document as Note #{copyrightViolation.note.id} (<strong>"{copyrightViolation.note.title}"</strong>). You cannot re-upload duplicate notes.
                  </>
                ) : (
                  <>
                    This document is already registered on the blockchain by original author <code>{copyrightViolation.note.author.slice(0,6)}...{copyrightViolation.note.author.slice(-4)}</code> (Note #{copyrightViolation.note.id}: <strong>"{copyrightViolation.note.title}"</strong>). Duplicate uploads of copyrighted content are blocked.
                  </>
                )}
              </p>
              <div style={{
                background: '#fee2e2',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                color: '#7f1d1d',
                fontFamily: 'monospace',
                border: '1px solid #fca5a5',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <div><strong>Token ID:</strong> #{copyrightViolation.note.id}</div>
                <div><strong>Original Title:</strong> "{copyrightViolation.note.title}"</div>
                <div><strong>Original Author:</strong> {copyrightViolation.note.author}</div>
                {copyrightViolation.note.ipfsHash && (
                  <div><strong>IPFS Hash:</strong> {copyrightViolation.note.ipfsHash}</div>
                )}
                <div><strong>Violation Reason:</strong> {copyrightViolation.isPurchased ? 'Attempted re-upload of purchased material' : 'Duplicate document CID match'}</div>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className={styles.content}>
        <Card className={styles.formCard}>
          <form onSubmit={handleSubmit} className={styles.form}>
            {/* File Upload Section */}
            <div className={styles.formSection}>
              <IPFSFileUpload 
                onFileUploaded={handleFileUploaded}
                disabled={loading}
              />
            </div>

            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>📝 Note Details</h3>
              
              <div className={styles.inputGroup}>
                <label htmlFor="title" className={styles.label}>
                  Title *
                </label>
                <Input
                  id="title"
                  name="title"
                  type="text"
                  placeholder="Enter note title..."
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="description" className={styles.label}>
                  Description *
                </label>
                <Input
                  id="description"
                  name="description"
                  type="text"
                  placeholder="Brief description of your note..."
                  value={formData.description}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="subject" className={styles.label}>
                  Subject *
                </label>
                <Input
                  id="subject"
                  name="subject"
                  type="text"
                  placeholder="e.g., Mathematics, Physics, Computer Science..."
                  value={formData.subject}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="content" className={styles.label}>
                  Additional Text Content
                </label>
                <textarea
                  id="content"
                  name="content"
                  className={styles.textarea}
                  placeholder="Optional: Add additional text content or notes here..."
                  value={formData.content}
                  onChange={handleInputChange}
                  rows={6}
                />
                <p className={styles.helperText}>
                  This text will be stored on the blockchain along with your uploaded file.
                </p>
              </div>
            </div>

            <div className={styles.formSection}>
              <h3 className={styles.sectionTitle}>💰 Pricing</h3>
              
              <div className={styles.inputGroup}>
                <label htmlFor="price" className={styles.label}>
                  Price (ETH) *
                </label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  step="0.001"
                  min="0.001"
                  placeholder="0.01"
                  value={formData.price}
                  onChange={handleInputChange}
                  required
                />
                <p className={styles.helperText}>
                  Set a fair price for your note. Consider the value and effort put into creating it.
                </p>
              </div>
            </div>

            <div className={styles.actions}>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={loading || (copyrightViolation && copyrightViolation.isDuplicate)}
                className={styles.submitButton}
                style={copyrightViolation?.isDuplicate ? {
                  backgroundColor: '#ef4444',
                  borderColor: '#dc2626',
                  cursor: 'not-allowed',
                  opacity: 0.85
                } : {}}
              >
                {loading 
                  ? '🔄 Creating on Blockchain...' 
                  : (copyrightViolation && copyrightViolation.isDuplicate)
                    ? '🚫 Upload Blocked (Copyright Violation)' 
                    : '✨ Create Note NFT'}
              </Button>
              
              <p className={styles.helperText}>
                {copyrightViolation?.isDuplicate 
                  ? '⚠️ Submission disabled because this note is already registered or was purchased by your wallet.' 
                  : "ℹ️ Make sure MetaMask is connected and you're on Sepolia testnet"}
              </p>
            </div>
          </form>
        </Card>

        <Card className={styles.previewCard}>
          <h3 className={styles.previewTitle}>📋 Preview</h3>
          
          <div className={styles.preview}>
            <div className={styles.previewHeader}>
              <h4 className={styles.previewNoteTitle}>
                {formData.title || 'Note Title'}
              </h4>
              <span className={styles.previewPrice}>
                {formData.price || '0.01'} ETH
              </span>
            </div>

            <div className={styles.previewMeta}>
              <span className={styles.previewSubject}>
                📚 {formData.subject || 'Subject'}
              </span>
              <span className={styles.previewCreator}>
                👤 Your Connected Wallet
              </span>
            </div>
            
            {formData.description && (
              <p className={styles.previewDescription}>
                {formData.description}
              </p>
            )}

            {uploadedFile && (
              <div className={styles.previewFile}>
                <h5>📁 Attached File:</h5>
                <div className={styles.previewFileInfo}>
                  <span className={styles.fileName}>{uploadedFile.name}</span>
                  <span className={styles.fileSize}>
                    {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                <div className={styles.ipfsInfo}>
                  <strong>IPFS Hash:</strong> <code>{uploadedFile.hash}</code>
                </div>
              </div>
            )}
            
            <div className={styles.previewContent}>
              {formData.content ? (
                <pre className={styles.previewText}>{formData.content}</pre>
              ) : (
                <p className={styles.placeholderText}>
                  {uploadedFile 
                    ? "Your uploaded file will be the main content, with any additional text shown here..." 
                    : "Your note content will appear here..."
                  }
                </p>
              )}
            </div>
          </div>

          <div className={styles.blockchainInfo}>
            <h4>🔗 Blockchain Features</h4>
            <ul>
              <li>✅ Immutable ownership record</li>
              <li>🌐 Decentralized file storage via IPFS</li>
              <li>� Automated royalty payments</li>
              <li>🔒 Cryptographic proof of authenticity</li>
              <li>📊 Transparent transaction history</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default CreatePage;
