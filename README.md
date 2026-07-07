 # School Attendance Record (Supabase + HTML/CSS/JS)

 Simple attendance application scaffold using Supabase as the backend and vanilla HTML/CSS/JS for the frontend.

 Quick setup

 1. Create a Supabase project at https://app.supabase.com
 2. In the SQL editor, run `supabase_schema.sql` to create tables and sample data.
 3. Obtain your `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the project settings.
 4. Open `supabaseConfig.js` and replace the placeholder values with your project values.
 5. Run a simple static server in this folder. Example using `http-server`:

 ```bash
 npx http-server -c-1 . -p 8080
 # or
 npx serve . -p 8080
 ```

 Open http://localhost:8080 in your browser.

 Notes

 - Authentication: this scaffold assumes you will use Supabase Auth for the teacher account. Create a user in the Supabase Auth dashboard and sign in via the UI you add later.
 - The UI is basic but structured to be extended. See `index.html`, `styles.css`, and `app.js`.
