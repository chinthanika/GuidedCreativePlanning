// ============================================
// MOCK DATA FOR DEMO
// ============================================
const getMockBooks = () => [
  {
    id: '1',
    title: 'Akata Witch',
    author: 'Nnedi Okorafor',
    year: 2011,
    coverUrl: 'https://covers.openlibrary.org/b/id/8228691-L.jpg',
    rating: 4.2,
    description: 'Sunny Nwazue lives in Nigeria, but she was born in New York City. Her features are West African, but she\'s albino. She\'s a terrific athlete, but can\'t go out into the sun...',
    explanation: 'This book explores the tension between fearing one\'s abilities and needing to embrace them—similar to the internal conflict you described.',
    matchHighlights: ['Fear of power', 'Identity', 'Magic discovery'],
    source: 'google_books'
  },
  {
    id: '2',
    title: 'The Outsiders',
    author: 'S.E. Hinton',
    year: 1967,
    coverUrl: 'https://covers.openlibrary.org/b/id/8228690-L.jpg',
    rating: 4.6,
    description: 'The story of Ponyboy Curtis and his struggles with right and wrong in a society in which he believes he is an outsider.',
    explanation: 'This classic coming-of-age story examines belonging and identity through class conflict.',
    matchHighlights: ['Coming-of-age', 'Identity', 'Belonging'],
    source: 'curated'
  },
  {
    id: '3',
    title: 'Children of Blood and Bone',
    author: 'Tomi Adeyemi',
    year: 2018,
    coverUrl: 'https://covers.openlibrary.org/b/id/8761378-L.jpg',
    rating: 4.4,
    description: 'Zélie Adebola remembers when the soil of Orïsha hummed with magic. But everything changed the night magic disappeared.',
    explanation: 'Features a protagonist who must reclaim forbidden magic despite the dangers, echoing your character\'s journey.',
    matchHighlights: ['Magic systems', 'Rebellion', 'Legacy'],
    source: 'google_books'
  }
];

const mockSendMessage = async (message) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return {
    chat_message: `I understand you're exploring ${message.toLowerCase()}. That's an interesting direction!`,
    session_id: 'demo-session-123',
    mode: 'brainstorming'
  };
};
export { getMockBooks, mockSendMessage };