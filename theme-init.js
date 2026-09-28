/* Apply the saved theme before anything paints. Light is the default. */
try { if (localStorage.getItem('tj_theme') === 'dark') document.documentElement.classList.add('dark'); } catch (e) { /* storage blocked: stay light */ }
