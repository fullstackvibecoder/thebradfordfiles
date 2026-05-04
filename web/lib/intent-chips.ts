export interface IntentChip {
  label: string;
  query: string;
}

export const INTENT_CHIPS: IntentChip[] = [
  { label: "Housing record", query: "What are the candidates' positions and votes on housing?" },
  { label: "Transit record", query: "What are the candidates' positions and votes on transit?" },
  { label: "Public safety", query: "What are the candidates' positions on public safety?" },
  { label: "Tax & fiscal", query: "What are the candidates' positions and votes on taxes and fiscal policy?" },
  { label: "Parks & environment", query: "What are the candidates' positions on parks and environment?" },
  { label: "Infrastructure", query: "What are the candidates' positions on infrastructure?" },
  { label: "Social services", query: "What are the candidates' positions on social services?" },
  { label: "Small business", query: "What are the candidates' positions on small business and the economy?" },
  { label: "Civic engagement", query: "What are the candidates' positions on civic engagement?" },
  { label: "Governance & ethics", query: "What are the candidates' positions on governance and ethics?" },
];
