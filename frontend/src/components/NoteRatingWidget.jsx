import React, { useState, useEffect } from 'react';
import { notesContract } from '../contractConnection';

export default function NoteRatingWidget({ tokenId, account, onRated }) {
  const [existingRating, setExistingRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchRating = async () => {
      if (!account || tokenId === undefined) {
        setLoading(false);
        return;
      }
      try {
        const rating = await notesContract.getUserRating(account, tokenId);
        if (isMounted) {
          setExistingRating(Number(rating));
          setSelectedRating(Number(rating));
        }
      } catch (err) {
        console.warn('Could not fetch existing rating:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRating();
    return () => { isMounted = false; };
  }, [tokenId, account]);

  const handleSubmitRating = async () => {
    if (selectedRating < 1 || selectedRating > 5) {
      alert('Please select a star rating between 1 and 5 stars!');
      return;
    }

    try {
      setIsSubmitting(true);
      await notesContract.rateNote(tokenId, selectedRating);
      setExistingRating(selectedRating);
      alert(`🎉 Thank you! Your rating of ${selectedRating} stars has been recorded on the blockchain.`);
      if (onRated) onRated();
    } catch (error) {
      console.error('Error submitting rating:', error);
      alert('Failed to submit rating: ' + (error.reason || error.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ fontSize: '0.8rem', color: '#64748b', padding: '6px 0' }}>
        Checking rating status...
      </div>
    );
  }

  // Already rated
  if (existingRating > 0) {
    return (
      <div style={{
        background: '#fefce8',
        border: '1px solid #fef08a',
        borderRadius: '10px',
        padding: '8px 12px',
        marginTop: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '6px'
      }}>
        <span style={{ fontSize: '0.85rem', color: '#854d0e', fontWeight: '600' }}>
          ⭐ Your Review:
        </span>
        <span style={{ color: '#eab308', fontSize: '1.1rem', letterSpacing: '2px', fontWeight: 'bold' }}>
          {'★'.repeat(existingRating)}{'☆'.repeat(5 - existingRating)} ({existingRating}/5)
        </span>
      </div>
    );
  }

  // Not yet rated - interactive rating
  return (
    <div style={{
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '12px',
      marginTop: '12px'
    }}>
      <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
        ⭐ Rate this Note (Blockchain Review):
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', cursor: 'pointer', fontSize: '1.4rem' }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <span
              key={star}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setSelectedRating(star)}
              style={{
                color: (hoverRating || selectedRating) >= star ? '#eab308' : '#cbd5e1',
                transition: 'color 0.15s ease',
                userSelect: 'none',
                cursor: 'pointer'
              }}
              title={`Rate ${star} star${star > 1 ? 's' : ''}`}
            >
              ★
            </span>
          ))}
        </div>

        <button
          onClick={handleSubmitRating}
          disabled={selectedRating === 0 || isSubmitting}
          style={{
            background: selectedRating > 0 ? '#eab308' : '#e2e8f0',
            color: selectedRating > 0 ? '#713f12' : '#94a3b8',
            border: 'none',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: '0.85rem',
            fontWeight: '700',
            cursor: selectedRating > 0 ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            boxShadow: selectedRating > 0 ? '0 2px 6px rgba(234, 179, 8, 0.3)' : 'none'
          }}
        >
          {isSubmitting ? '⏳ Submitting...' : selectedRating > 0 ? `Submit ${selectedRating}★` : 'Select Stars'}
        </button>
      </div>
    </div>
  );
}
