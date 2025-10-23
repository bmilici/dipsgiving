<script type="module">
  // ---- Firebase (v9+ modular) ----
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import {
    getFirestore, collection, addDoc, serverTimestamp,
    query, where, getDocs, limit
  } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

  // TODO: replace with your real config from Firebase console
  const firebaseConfig = {
    apiKey: "YOUR_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "SENDER_ID",
    appId: "APP_ID"
  };

  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);
  const registrationsCol = collection(db, "dipsgiving_registrations"); // collection name

  // ---- Modal wiring (unchanged basics) ----
  const openBtn  = document.getElementById('open-register');
  const dlg      = document.getElementById('register-dialog');
  const closeBtn = document.getElementById('close-register');
  const cancelBtn= document.getElementById('cancel-register');
  const form     = document.getElementById('register-form');
  const statusEl = document.getElementById('form-status');
  const tsField  = document.getElementById('ts-field');

  function openDialog(e){
    e && e.preventDefault();
    tsField.value = new Date().toISOString();
    dlg.showModal?.() || alert('Registration not supported on this browser.');
  }
  openBtn.addEventListener('click', openDialog);
  closeBtn.addEventListener('click', () => dlg.close());
  cancelBtn.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => {
    const r = dlg.getBoundingClientRect();
    if (!(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)) dlg.close();
  });

  // ---- Submit to Firestore ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.hidden = false;
    statusEl.textContent = 'Submitting…';

    const data = Object.fromEntries(new FormData(form)); // {name, email, phone, dip_name, party_size, notes, ...}
    data.party_size = Number(data.party_size || 1);
    data.event = "4th Annual Dipsgiving";
    data.user_ts = new Date(tsField.value || Date.now()).toISOString();
    data.created_at = serverTimestamp();

    try {
      // Optional: prevent duplicate emails
      const dupQ = query(registrationsCol, where('email','==', data.email), limit(1));
      const dupSnap = await getDocs(dupQ);
      if (!dupSnap.empty) {
        statusEl.textContent = 'Looks like you already registered with this email. Need to update? Reply to the confirmation email or contact us.';
        return;
      }

      await addDoc(registrationsCol, data);
      statusEl.textContent = 'All set! You’re registered.';
      form.reset();
      setTimeout(() => dlg.close(), 900);
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Error saving your registration. Please try again.';
    }
  });
</script>
