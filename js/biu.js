// Benson Idahosa University rules, from the Faculty of Computing undergraduate handbook.
// Transcribed from photos: course units/status on 300–400 level should be verified.

export const BIU = {
  name: 'Benson Idahosa University',
  short: 'BIU',
  // Handbook §23 (Grading)
  grades: [
    { g: 'A', p: 5, min: 70 }, { g: 'B', p: 4, min: 60 }, { g: 'C', p: 3, min: 50 },
    { g: 'D', p: 2, min: 45 }, { g: 'E', p: 1, min: 40 }, { g: 'F', p: 0, min: 0 },
  ],
  // Handbook §28 (Class of degree)
  classes: [
    { min: 4.5, label: 'First Class', short: '1st' },
    { min: 3.5, label: 'Second Class Upper', short: '2:1' },
    { min: 2.4, label: 'Second Class Lower', short: '2:2' },
    { min: 1.5, label: 'Third Class', short: '3rd' },
    { min: 1.0, label: 'Pass', short: 'Pass' },
    { min: 0, label: 'Below pass', short: '—' },
  ],
  // Handbook §27 (weights of each level's GPA in the final grade)
  weights: {
    utme: { 100: 0.05, 200: 0.20, 300: 0.35, 400: 0.40 }, // 4-year programme
    de: { 100: 0, 200: 0.25, 300: 0.35, 400: 0.40 },      // 3-year (direct entry)
  },
  // Handbook §16 (promotion / probation / withdrawal)
  promotion: { promote: 0.5, probation: 0.25 },
  max: 5,
};

// B.Sc. Computer Science course structure (CCMAS, 2023/2024 handbook)
// [code, title, units, status]  status: C = core, R = required, E = elective
const CS = {
  '100-1': [
    ['CSC 111', 'Introduction to Computer Sciences', 3, 'C'], ['CSC 112', 'Introduction to Computer Applications', 3, 'R'],
    ['CSC 113', 'Visual Basic Programming', 2, 'R'], ['MTH 111', 'Elementary Mathematics I', 2, 'C'],
    ['PHY 111', 'General Physics I', 2, 'C'], ['PHY 113', 'General Physics Practical I', 1, 'C'],
    ['GST 111', 'Communication in English', 2, 'R'], ['GST 112', 'Nigerian Peoples and Culture', 2, 'R'],
    ['IDS 111', 'Rudiments of Christian Life', 1, 'R'],
  ],
  '100-2': [
    ['CSC 121', 'Introduction to Problem Solving', 3, 'C'], ['CSC 122', 'Introduction to Computer Practical', 2, 'R'],
    ['CSC 123', 'Business Applications and File Processing', 2, 'R'], ['CSC 124', 'Web Development and Mobile Applications', 2, 'R'],
    ['MTH 121', 'Descriptive Statistics', 3, 'C'], ['MTH 122', 'Elementary Mathematics II (Calculus)', 2, 'C'],
    ['PHY 121', 'General Physics II', 2, 'C'], ['PHY 123', 'General Physics Practical II', 1, 'C'],
    ['IDS 121', 'Life and Times of Archbishop Benson Idahosa', 1, 'R'],
  ],
  '200-1': [
    ['CSC 211', 'Computer Programming I (C++)', 2, 'C'], ['CSC 212', 'Discrete Structures', 2, 'C'],
    ['CSC 213', 'Digital Computer Design', 2, 'C'], ['CSC 214', 'Computer Hardware', 1, 'R'],
    ['CSC 215', 'Computer Hardware Practical I', 1, 'R'], ['CSC 216', 'Theory and Practical of Structured Query Language', 2, 'R'],
    ['CSC 217', 'Assembly Language Programming and Practical', 2, 'R'], ['MTH 211', 'Mathematical Methods I', 2, 'C'],
    ['GST 212', 'Logic, Philosophy and Human Existence', 2, 'C'], ['ENT 211', 'Entrepreneurship and Innovation', 2, 'C'],
  ],
  '200-2': [
    ['CSC 221', 'Introduction to Software Engineering', 2, 'C'], ['CSC 222', 'Computer Programming II (Java)', 2, 'C'],
    ['CSC 223', 'Computer Architecture and Organization', 2, 'C'], ['CSC 224', 'Computer Hardware Practical II', 2, 'R'],
    ['CSC 225', 'Network and Graph Theory', 2, 'C'], ['CSC 226', 'Real Time Application Theory', 1, 'R'],
    ['CSC 227', 'Computer Programming II (Java Practical)', 2, 'C'], ['CSC 229', 'Student Industrial Work Experience Scheme (SIWES I)', 3, 'C'],
    ['MTH 221', 'Elementary Differential Equations', 2, 'C'],
  ],
  '300-1': [
    ['CSC 311', 'Fundamentals of Data Structures', 2, 'R'], ['CSC 312', 'Compiler Construction I', 2, 'R'],
    ['CSC 313', 'Operating Systems I', 2, 'R'], ['CSC 314', 'Data Communication and Networking', 2, 'R'],
    ['CSC 315', 'Introduction to Computer and Programming using Python', 2, 'R'], ['CSC 316', 'Introduction to Data Classification', 2, 'C'],
    ['CSC 317', 'Artificial Intelligence', 2, 'C'], ['CSC 318', 'Human Computer Interface (HCI)', 2, 'C'],
    ['ENT 312', 'Venture Creation', 2, 'C'],
  ],
  '300-2': [
    ['CSC 321', 'Computer Science Innovation and New Technology', 2, 'R'], ['CSC 322', 'Introduction to Cyber Security', 2, 'R'],
    ['CSC 323', 'Data Management I', 2, 'R'], ['CSC 324', 'Machine Learning in Computing', 2, 'R'],
    ['CSC 325', 'Introduction to Metaverse and Its Application', 2, 'R'], ['CSC 326', 'Database Management System and SQL', 2, 'R'],
    ['CSC 327', 'Operations Research', 2, 'C'], ['CSC 328', 'Introduction to Cyber Security and Strategy', 1, 'C'],
    ['CSC 329', 'Student Industrial Work Experience Scheme (SIWES II)', 3, 'C'],
  ],
  '400-1': [
    ['CSC 411', 'Research Methodology and Technical Report Writing', 3, 'C'], ['CSC 412', 'Algorithms and Complexity Analysis', 3, 'C'],
    ['CSC 413', 'Project Management', 2, 'C'], ['CSC 414', 'Principles of Parallel Computing', 3, 'C'],
    ['CSC 415', 'Quantum Computing', 2, 'E'], ['CSC 416', 'Internet of Things', 3, 'E'], ['CSC 417', 'Seminar', 2, 'C'],
  ],
  '400-2': [
    ['CSC 421', 'Digital Marketing', 3, 'R'], ['CSC 422', 'Distributed Ledger Computing Systems', 2, 'E'],
    ['CSC 423', 'Computer Performance Evaluation', 3, 'C'], ['CSC 424', 'Distributed Computing', 2, 'C'],
    ['CSC 425', 'Statistical Computing', 2, 'E'], ['CSC 426', 'Project', 3, 'C'],
    ['CSC 427', 'Ethics and Legal Issues in Computer Science', 3, 'C'],
  ],
  // Extra courses listed as compulsory for direct-entry students
  de: [
    ['GST 113', 'Nigerian Peoples and Culture', 2, 'R'],
  ],
};

export const PROGRAMMES = {
  csc: { id: 'csc', name: 'Computer Science', degree: 'B.Sc. Computer Science', structure: CS },
};

export function catalog(progId = 'csc') {
  const p = PROGRAMMES[progId];
  const map = new Map();
  for (const [key, list] of Object.entries(p.structure)) {
    const [level, sem] = key.split('-');
    for (const [code, title, units, status] of list) {
      if (!map.has(code)) map.set(code, { code, title, units, status, level: Number(level) || null, semester: Number(sem) || null });
    }
  }
  return map;
}

export function semesterCourses(progId, level, semester) {
  const p = PROGRAMMES[progId];
  return (p.structure[`${level}-${semester}`] || []).map(([code, title, units, status]) => ({ code, title, units, status }));
}

/** Units the curriculum expects per course series (used to project remaining work). */
export function seriesTotals(progId = 'csc') {
  const out = { 100: 0, 200: 0, 300: 0, 400: 0 };
  for (const [key, list] of Object.entries(PROGRAMMES[progId].structure)) {
    const lvl = Number(key.split('-')[0]);
    if (!out[lvl] && out[lvl] !== 0) continue;
    for (const c of list) out[lvl] += c[2];
  }
  return out;
}
