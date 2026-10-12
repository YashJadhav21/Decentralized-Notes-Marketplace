import React, { useState } from 'react';
import { notesContract } from '../contractConnection';
import { useWeb3 } from '../contexts/Web3Context';

const CreateNoteTestComponent = () => {
  const { state: web3State, connectWallet } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const isConnected = web3State.isConnected;
  const userAddress = web3State.account || '';

  const checkConnection = async () => {
    try {
      if (!web3State.isConnected) {
        await connectWallet();
      }
      await notesContract.connect();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  const testCreateNoteWithFileUpload = async () => {
    setLoading(true);
    setResult('');

    try {
      // Simulate an uploaded file
      const mockUploadedFile = {
        name: 'test-study-notes.pdf',
        hash: 'QmTestHashFromCreatePage' + Date.now(),
        size: 1024 * 500, // 500KB
        type: 'application/pdf'
      };

      console.log('🧪 Testing create note with mock IPFS file...');

      // Use the exact same logic as the CreatePage
      const metadata = {
        title: 'Test Note from Create Page',
        description: 'This is a test note created from the Create Page component',
        content: 'Additional text content here...',
        subject: 'Test Subject',
        ipfsHash: mockUploadedFile.hash,
        createdAt: new Date().toISOString(),
        hasUploadedFile: true,
        type: 'file-note'
      };
      const metadataURI = `data:application/json;base64,${btoa(JSON.stringify(metadata))}`;

      const receipt = await notesContract.createNote(
        'Test Note from Create Page',
        'This is a test note created from the Create Page component',
        mockUploadedFile.hash,
        0.001, // 0.001 ETH
        'Test Subject',
        metadataURI
      );

      setResult(`✅ SUCCESS! Note created with transaction: ${receipt.hash}`);
      console.log('🎉 Test successful!', receipt);

    } catch (error) {
      setResult(`❌ ERROR: ${error.message}`);
      console.error('Test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const testCreateNoteWithoutFile = async () => {
    setLoading(true);
    setResult('');

    try {
      console.log('🧪 Testing create note without file upload...');

      // Text-only note
      const metadata = {
        title: 'Text-Only Test Note',
        description: 'This note has no uploaded file',
        content: 'This is the main content of the note stored as text.',
        subject: 'Text Testing',
        ipfsHash: 'QmTextOnly' + Date.now(),
        createdAt: new Date().toISOString(),
        hasUploadedFile: false,
        type: 'text-note'
      };
      const metadataURI = `data:application/json;base64,${btoa(JSON.stringify(metadata))}`;

      const receipt = await notesContract.createNote(
        'Text-Only Test Note',
        'This note has no uploaded file',
        'QmTextOnly' + Date.now(),
        0.002, // 0.002 ETH
        'Text Testing',
        metadataURI
      );

      setResult(`✅ SUCCESS! Text note created with transaction: ${receipt.hash}`);
      console.log('🎉 Text-only test successful!', receipt);

    } catch (error) {
      setResult(`❌ ERROR: ${error.message}`);
      console.error('Text-only test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>🧪 Create Note Test Component</h2>
      
      <div style={{ 
        background: isConnected ? '#d4edda' : '#f8d7da',
        padding: '15px',
        borderRadius: '5px',
        marginBottom: '20px'
      }}>
        <h3>Connection Status</h3>
        <p><strong>Status:</strong> {isConnected ? '✅ Connected' : '❌ Not Connected'}</p>
        <p><strong>Address:</strong> {userAddress}</p>
        
        {!isConnected && (
          <button onClick={checkConnection} style={{ padding: '10px 20px', margin: '10px 0' }}>
            🔄 Try Connect
          </button>
        )}
      </div>

      {isConnected && (
        <div>
          <h3>Test Create Note Functions</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <button 
              onClick={testCreateNoteWithFileUpload}
              disabled={loading}
              style={{
                background: '#28a745',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: loading ? 'not-allowed' : 'pointer',
                marginRight: '10px'
              }}
            >
              {loading ? '⏳ Testing...' : '📁 Test with Mock File Upload'}
            </button>

            <button 
              onClick={testCreateNoteWithoutFile}
              disabled={loading}
              style={{
                background: '#007bff',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? '⏳ Testing...' : '📝 Test Text-Only Note'}
            </button>
          </div>

          {result && (
            <div style={{
              background: result.includes('SUCCESS') ? '#d4edda' : '#f8d7da',
              border: `1px solid ${result.includes('SUCCESS') ? '#c3e6cb' : '#f5c6cb'}`,
              borderRadius: '5px',
              padding: '15px',
              marginTop: '20px'
            }}>
              <h4>Test Result:</h4>
              <p>{result}</p>
            </div>
          )}
        </div>
      )}

      <div style={{ 
        background: '#e7f3ff',
        padding: '15px',
        borderRadius: '5px',
        marginTop: '20px'
      }}>
        <h4>ℹ️ How This Works</h4>
        <p>This component tests the exact same create note logic used in the CreatePage component.</p>
        <p><strong>With File:</strong> Simulates an IPFS file upload and creates a note</p>
        <p><strong>Text-Only:</strong> Creates a note with just text content (no file upload)</p>
        <p>Both use the 6-parameter contract function that matches your deployed contract.</p>
      </div>
    </div>
  );
};

export default CreateNoteTestComponent;
