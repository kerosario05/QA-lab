export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  avatarUrl?: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
  goal?: string;
}
