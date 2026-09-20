export function createRequestGate() {
  let latest = 0;
  return {
    begin() {
      latest += 1;
      return latest;
    },
    isCurrent(requestId) {
      return requestId === latest;
    },
  };
}

export function isActiveTechnician(users, userId) {
  return users.some((user) => user.id === userId && user.role === 'TECHNICIAN' && user.active);
}
