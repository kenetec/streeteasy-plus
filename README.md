# streeteasy-plus
All the shit that I need for StreetEasy to actually be useful

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in a free Geoapify API key
   (https://myprojects.geoapify.com)
3. `npm run build`
4. Load the extension: open `chrome://extensions`, enable Developer mode,
   click **Load unpacked**, and select the `dist/` folder

Run `npm run watch` while developing, then reload the extension in
`chrome://extensions` (or just refresh the tab for content-script-only
changes).
