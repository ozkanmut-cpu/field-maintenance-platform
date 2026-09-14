const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '../src/CorporateApp.tsx');
let source = fs.readFileSync(file, 'utf8');

const oldSaveSignature = "  async function saveCompletedTask(task: DueTask, assistedForTechnicianId: string | undefined, loc: Awaited<ReturnType<typeof currentLocation>>) {";
const newSaveSignature = "  async function saveCompletedTask(task: DueTask, assistedForTechnicianId: string | undefined, loc: Awaited<ReturnType<typeof currentLocation>>, locationPresenceConfirmed = true) {";
if (!source.includes(oldSaveSignature)) throw new Error('saveCompletedTask signature not found');
source = source.replace(oldSaveSignature, newSaveSignature);

const oldCompleteCall = "    await completeMaintenance({ pointId: task.pointId, assistedForTechnicianId, latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters: loc.coords.accuracy ?? undefined, locationCapturedAt: new Date(loc.timestamp).toISOString(), deviceRecordedAt: new Date().toISOString(), ...equipmentValues, equipmentConfirmed: true, idempotencyKey: `maintenance-${user?.id}-${task.pointId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });";
const newCompleteCall = "    const accuracyMeters = locationPresenceConfirmed ? (loc.coords.accuracy ?? undefined) : Math.max(loc.coords.accuracy ?? 0, 999);\n    await completeMaintenance({ pointId: task.pointId, assistedForTechnicianId, latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters, locationCapturedAt: new Date(loc.timestamp).toISOString(), deviceRecordedAt: new Date().toISOString(), ...equipmentValues, equipmentConfirmed: true, idempotencyKey: `maintenance-${user?.id}-${task.pointId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });";
if (!source.includes(oldCompleteCall)) throw new Error('completeMaintenance call not found');
source = source.replace(oldCompleteCall, newCompleteCall);

const oldButtons = "        { text: 'Hayır', style: 'cancel' },\n        { text: 'Evet, noktadayım', onPress: () => void saveCompletedTask(task, assistedForTechnicianId, loc).catch(e => Alert.alert('Bakım kaydedilemedi', message(e))) },";
const newButtons = "        { text: 'İptal et', style: 'cancel' },\n        { text: 'Hayır, ama bakımı yaptım', onPress: () => void saveCompletedTask(task, assistedForTechnicianId, loc, false).catch(e => Alert.alert('Bakım kaydedilemedi', message(e))) },\n        { text: 'Evet, noktadayım', onPress: () => void saveCompletedTask(task, assistedForTechnicianId, loc, true).catch(e => Alert.alert('Bakım kaydedilemedi', message(e))) },";
if (!source.includes(oldButtons)) throw new Error('location confirmation buttons not found');
source = source.replace(oldButtons, newButtons);

fs.writeFileSync(file, source);
console.log('Location confirmation flow patched: off-site maintenance saves, on-site confirmation saves with location evidence, and cancel does not save.');
