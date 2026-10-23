const medicineButtons = [...document.querySelectorAll('[data-field]')];
const medicineProfiles = [...document.querySelectorAll('[data-therapy]')];
medicineButtons.forEach(button => button.addEventListener('click', () => {
  const field = button.dataset.field;
  medicineButtons.forEach(item => {const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active));});
  let count = 0;
  medicineProfiles.forEach(profile => {profile.hidden = field !== 'all' && profile.dataset.therapy !== field; if (!profile.hidden) count++;});
  document.getElementById('medicineCount').textContent = `${count} 个${field === 'all' ? '代表' : field}实例`;
}));
