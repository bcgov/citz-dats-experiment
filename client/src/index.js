import app from './app.js';

app.listen(5100, () => {
  try {
    console.log(`Started client on port 5100`);
  } catch (error) {
    console.error(error);
  }
});
