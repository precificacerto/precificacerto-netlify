const admin = require('firebase-admin');
const serviceAccount = require('../credential.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteCollection(db, collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(db, query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  for (const doc of snapshot.docs) {
      // Recursively delete subcollections
      const subcollections = await doc.ref.listCollections();
      for (const subcollection of subcollections) {
          console.log(`  Deletando subcoleção: ${subcollection.path}`);
          await deleteCollection(db, subcollection.path, 100);
      }
      batch.delete(doc.ref);
  }
  await batch.commit();
  console.log(`  Deletado batch de ${batchSize} documentos.`);

  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

async function main() {
    console.log('🚧 INICIANDO DELEÇÃO TOTAL DE DADOS DO FIRESTORE 🚧');
    const collections = await db.listCollections();
    
    if (collections.length === 0) {
        console.log('Nenhuma coleção encontrada na raiz.');
        return;
    }

    for (const collection of collections) {
        console.log(`🗑️ Deletando coleção raiz: ${collection.id}`);
        await deleteCollection(db, collection.id, 100);
    }
    console.log('✅ Limpeza concluída com sucesso!');
}

main().catch(console.error);
