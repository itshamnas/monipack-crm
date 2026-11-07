// Oman governorates and their wilayats (cities). Used by the customer form (browser) and validation (server).
export const OMAN_LOCATIONS = {
  'Muscat': ['Muscat', 'Muttrah', 'Bawshar', 'Al Seeb', 'Al Amerat', 'Qurayyat'],
  'Dhofar': ['Salalah', 'Taqah', 'Mirbat', 'Sadah', 'Shalim and the Hallaniyat Islands', 'Thumrait', 'Rakhyut', 'Dhalkut', 'Al Mazyunah', 'Muqshin'],
  'Musandam': ['Khasab', 'Bukha', 'Daba', 'Madha'],
  'Al Buraimi': ['Al Buraimi', 'Mahdah', 'As Sunaynah'],
  'Ad Dakhiliyah': ['Nizwa', 'Bahla', 'Manah', 'Al Hamra', 'Adam', 'Izki', 'Samail', 'Bidbid', 'Al Jabal Al Akhdar'],
  'Al Batinah North': ['Sohar', 'Shinas', 'Liwa', 'Saham', 'Al Khaburah', 'As Suwayq'],
  'Al Batinah South': ['Ar Rustaq', 'Al Awabi', 'Nakhal', 'Wadi Al Maawil', 'Barka', 'Al Musanaah'],
  'Ash Sharqiyah North': ['Ibra', 'Al Mudhaibi', 'Bidiyah', 'Al Qabil', 'Wadi Bani Khalid', 'Dima Wa At Taiyyin'],
  'Ash Sharqiyah South': ['Sur', 'Al Kamil Wal Wafi', 'Jaalan Bani Bu Hassan', 'Jaalan Bani Bu Ali', 'Masirah'],
  'Adh Dhahirah': ['Ibri', 'Yanqul', 'Dhank'],
  'Al Wusta': ['Haima', 'Mahout', 'Ad Duqm', 'Al Jazir'],
};

export const GOVERNORATES = Object.keys(OMAN_LOCATIONS);
