const sessionWithBatch = { locationId: { name: 'Room1' }, batchId: { name: 'BatchA' }, createdAt: new Date() };
const sessionNoBatch = { locationId: { name: 'Room1' }, batchId: null, createdAt: new Date() };

function getFilename(session) {
    const locationName = session.locationId?.name || 'Unknown Location';
    const batchName = session.batchId?.name ? `_${session.batchId.name}` : '';
    const sessionDate = session.createdAt ? new Date(session.createdAt) : new Date();
    const dateStr = sessionDate.toISOString().split('T')[0];
    const rawFilename = `${locationName}${batchName}_${dateStr}`;
    return `${rawFilename.replace(/[^a-zA-Z0-9_.-]/g, '_')}.xlsx`;
}

console.log("With batch: ", getFilename(sessionWithBatch));
console.log("No batch: ", getFilename(sessionNoBatch));
