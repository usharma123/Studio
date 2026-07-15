import { createLiveActivity } from "expo-widgets";

import { AgentActivity, type AgentActivityProps } from "./AgentActivity";

const AgentActivityLive = createLiveActivity<AgentActivityProps>("AgentActivity", AgentActivity);

export default AgentActivityLive;
