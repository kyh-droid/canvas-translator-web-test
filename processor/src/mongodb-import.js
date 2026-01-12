/**
 * Canvas Translation - MongoDB Import Module
 *
 * Imports translated canvas directly into user's StoryChat account
 * by creating entries in MongoDB collections:
 * - chatDb.aichat.chatnodemetadatas
 * - chatDb.aichat.chatcanvases
 */

import { MongoClient, ObjectId } from 'mongodb';

/**
 * Create a new canvas in MongoDB for a user
 * @param {Object} translatedCanvas - Translated canvas-export JSON
 * @param {string} userUid - User's MongoDB ObjectId (24-char hex)
 * @param {Object} options - { mongoUri, title }
 * @returns {Promise<Object>} - { canvasId, storyChatId, success }
 */
export async function importCanvasToMongoDB(translatedCanvas, userUid, options = {}) {
  const {
    mongoUri = process.env.MONGO_URI_3,
    title = `Translated Canvas - ${translatedCanvas.canvas.canvasLanguage}`,
  } = options;

  if (!mongoUri) {
    throw new Error('MongoDB URI not provided (MONGO_URI_3)');
  }

  if (!userUid || !/^[a-f0-9]{24}$/i.test(userUid)) {
    throw new Error('Invalid user UID format. Must be 24-character hex string.');
  }

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db('aichat');

    const nodeMetadataCollection = db.collection('chatnodemetadatas');
    const canvasCollection = db.collection('chatcanvases');

    const creatorOid = new ObjectId(userUid);

    // Step 1: Create NodeMetadata documents for each node
    console.log('Creating node metadata documents...');
    const metadataIdMap = {}; // uid -> ObjectId

    const metadataDocuments = [];
    for (const [uid, meta] of Object.entries(translatedCanvas.metadataSet)) {
      const doc = {
        nodeUid: uid,
        type: meta.type,
        ...meta,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      };

      // Remove fields that shouldn't be in metadata
      delete doc.uid;

      metadataDocuments.push({
        uid,
        doc,
      });
    }

    // Insert all metadata documents
    const insertedMetadata = [];
    for (const { uid, doc } of metadataDocuments) {
      const result = await nodeMetadataCollection.insertOne(doc);
      metadataIdMap[uid] = result.insertedId;
      insertedMetadata.push(result.insertedId);
    }

    console.log(`Created ${insertedMetadata.length} node metadata documents`);

    // Step 2: Build nodes array with metadataOid references
    const nodes = translatedCanvas.nodes.map(node => ({
      uid: node.uid,
      hash: node.hash || '',
      coordinates: node.coordinates || { x: 0, y: 0 },
      deleted: node.deleted || false,
      name: node.name || '',
      type: node.type,
      metadataOid: metadataIdMap[node.uid] || null,
    }));

    // Step 3: Create ChatCanvas document
    console.log('Creating canvas document...');
    const canvasDoc = {
      creatorOid,
      canvasLanguage: translatedCanvas.canvas.canvasLanguage,
      compilerVersion: translatedCanvas.canvas.compilerVersion || 4,
      nodes,
      connections: translatedCanvas.connections || [],
      compiledNodes: [], // Will be populated by compiler
      compiledConnections: [],
      needsCompilation: true, // IMPORTANT: Triggers async compilation
      isCompiling: false,
      tagCategorization: translatedCanvas.canvas.tagCategorization || { categories: [] },
      embeddingService: translatedCanvas.canvas.embeddingService || 'gemini',
      embeddingModel: translatedCanvas.canvas.embeddingModel || 'gemini-embedding-001',
      imageTaggingMethod: translatedCanvas.canvas.imageTaggingMethod || 2,
      useKRJPGuidelines: translatedCanvas.canvas.useKRJPGuidelines || false,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };

    const canvasResult = await canvasCollection.insertOne(canvasDoc);
    const canvasId = canvasResult.insertedId;

    console.log(`Created canvas: ${canvasId}`);

    // Note: We don't create the StoryChat document here as that's typically
    // done when the user publishes the content. The canvas is created as
    // a work-in-progress that the user can then edit and publish.

    return {
      success: true,
      canvasId: canvasId.toString(),
      nodeCount: insertedMetadata.length,
      message: 'Canvas imported successfully. It will be compiled automatically.',
    };
  } catch (error) {
    console.error('MongoDB import error:', error);
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * Check if a user exists in the database
 * @param {string} userUid - User's MongoDB ObjectId
 * @param {string} mongoUri - MongoDB connection string
 * @returns {Promise<boolean>}
 */
export async function verifyUserExists(userUid, mongoUri = process.env.MONGO_URI_3) {
  if (!mongoUri) {
    throw new Error('MongoDB URI not provided');
  }

  if (!userUid || !/^[a-f0-9]{24}$/i.test(userUid)) {
    return false;
  }

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    // Check in both possible user collections
    const db = client.db();
    const accountsDb = client.db('accounts');

    const user = await accountsDb.collection('accounts').findOne({
      _id: new ObjectId(userUid),
    });

    return !!user;
  } catch (error) {
    console.error('User verification error:', error);
    return false;
  } finally {
    await client.close();
  }
}

/**
 * Get user's existing canvases count (for validation)
 * @param {string} userUid - User's MongoDB ObjectId
 * @param {string} mongoUri - MongoDB connection string
 * @returns {Promise<number>}
 */
export async function getUserCanvasCount(userUid, mongoUri = process.env.MONGO_URI_3) {
  if (!mongoUri) {
    throw new Error('MongoDB URI not provided');
  }

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db('aichat');

    const count = await db.collection('chatcanvases').countDocuments({
      creatorOid: new ObjectId(userUid),
    });

    return count;
  } catch (error) {
    console.error('Canvas count error:', error);
    return 0;
  } finally {
    await client.close();
  }
}

export default { importCanvasToMongoDB, verifyUserExists, getUserCanvasCount };
