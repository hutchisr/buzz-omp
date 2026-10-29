// Buzz keys an agent's membership by community. Older hosts only supply the
// public key; that remains the home membership's key and history location.
export const agentKey = (agent) => agent.key ?? agent.pubkey;
