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

export function createHelpLocationLifecycle() {
  const requestGate = createRequestGate();
  let locationVersion = 0;
  return {
    transition() {
      locationVersion += 1;
      requestGate.begin();
    },
    begin() {
      return { requestId: requestGate.begin(), locationVersion };
    },
    isCurrent(request) {
      return request.locationVersion === locationVersion && requestGate.isCurrent(request.requestId);
    },
  };
}

export function isActiveTechnician(users, userId) {
  return users.some((user) => user.id === userId && user.role === 'TECHNICIAN' && user.active);
}
