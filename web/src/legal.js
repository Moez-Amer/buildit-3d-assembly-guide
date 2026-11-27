// Privacy notice and imprint. DRAFTS: the parts in [brackets] must be filled in, and both texts checked by a lawyer,
// before the site goes public.
const DRAFT = '<p class="draft">Draft. Not yet checked by a lawyer.</p>';

const PAGES = {
  privacy: `<h1 class="h1s">Privacy notice</h1>${DRAFT}
    <p>This notice explains what Buildit stores about you, why, and what you can do about it.</p>
    <h2>Who is responsible</h2>
    <p>[Name]<br>[Address]<br>[Email address]</p>
    <h2>What we store</h2>
    <ul>
      <li><b>Your email address</b>, when you create an account, so we can send you sign-in links.</li>
      <li><b>Sign-in data</b>: when you last signed in, and your active sessions. Sign-in links and sessions are stored only in a scrambled form (a hash).</li>
      <li><b>Your guides and the manual pages you upload</b> (photos, videos turned into pictures, or PDFs), so you can open your guides again and compare each step with the original page.</li>
      <li><b>Your questions</b> in the "Stuck on this step?" box are sent to the AI model to get an answer. We do not keep them.</li>
      <li><b>Your ratings</b> of guides (stars and an optional comment), so we can see which guides are hard to follow. Your team sees them without your email address.</li>
    </ul>
    <p><b>Our team can look at your guides and the pages you upload</b>, to find mistakes in the guides and make the app read manuals better (our legitimate interest in a working service, Art. 6(1)(f) GDPR). Only named team members can, they can only look (never change or delete), and every time one of them opens your guide or its pages it is recorded: who, which guide and when. You can ask us for that record, and you can object: write to us and we will not look at your scans. Uploaded photos may show part of your home; take them so they show only the page.</p>
    <p>We use these data only to provide Buildit to you (Art. 6(1)(b) GDPR). If you signed up before scanning is open to everyone, we send you one email when it opens. We do not sell your data and do not use it for advertising.</p>
    <p>Fonts and all other files of the website come from our own server; your browser does not contact other companies when you open Buildit.</p>
    <h2>Who else handles your data</h2>
    <ul>
      <li><b>AI model provider</b> ([provider name and country]): reads the manual pages you upload and answers your questions.</li>
      <li><b>Email delivery</b> ([provider name and country]): sends the sign-in links.</li>
      <li><b>Hosting</b> ([provider name and country]): runs the server where your account and guides are stored.</li>
      <li><b>Database copy</b> ([provider name and country]): keeps a copy of your guides and ratings for our team; deleted with them.</li>
    </ul>
    <h2>Cookies and storage on your device</h2>
    <p>Buildit sets one cookie, only when you sign in, to keep you signed in. It is needed for the service, so we do not ask for consent. There are no tracking or advertising cookies. Your browser also remembers a few settings (the screen size calibration and the last step you opened); these stay on your device.</p>
    <h2>How long we keep data</h2>
    <p>Sign-in links expire after 15 minutes, sessions after 30 days. Your guides, pages, ratings and the AI model's replies for them are kept until you delete the guide or your account; then they are deleted from our server and from the database copy. Server logs are deleted after [number] days.</p>
    <h2>Your rights</h2>
    <p>You can ask to see, correct, export or delete your data, object to how it is used, and complain to a data protection authority. You can delete your guides, and your whole account, yourself at any time: open the account menu (the round button at the top right) and choose "Delete account". For anything else, write to [email address].</p>`,
  imprint: `<h1 class="h1s">Imprint</h1>${DRAFT}
    <p>Information according to § 5 DDG</p>
    <p>[Full name]<br>[Street and number]<br>[Postcode and city]<br>Germany</p>
    <h2>Contact</h2>
    <p>Email: [email address]</p>
    <h2>Responsible for the content</h2>
    <p>[Full name, address as above]</p>
    <p class="muted">Buildit is independent and not connected with any furniture brand or shop. Product names belong to their owners.</p>`,
};

export function legalPage(name) { return PAGES[name] || null; }
