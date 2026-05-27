# How to Run the LinkedIn Bot on Android (24/7)

By running the bot on your Android phone using Termux, the bot will stay awake 24/7 as long as your phone has an internet connection. It is extremely lightweight and will not drain your battery.

## Step 1: Install Termux
1. Go to the **Google Play Store** (or F-Droid).
2. Download **Termux** (a free terminal emulator that lets your phone run Linux code).
3. Go to your phone's Settings -> Apps -> Termux -> **Battery**, and set it to **"Unrestricted"**. This is critical so Android doesn't kill the bot when your screen is off.

## Step 2: Prepare the Files
We need to move the `linkedin-bot` folder from your laptop to your phone.
1. Open your `linkedin-bot` folder on your laptop.
2. **Delete the `node_modules` folder** (it's too big to copy, and needs to be installed freshly on Android anyway).
3. Right-click the `linkedin-bot` folder and select **"Compress to ZIP file"**.
4. Transfer that ZIP file to your phone's `Download` folder (via USB, Google Drive, email, etc.).

## Step 3: Run the Bot
Open the **Termux** app on your phone and run these commands one by one (press Enter after each):

**1. Allow Termux to access your phone's files:**
```bash
termux-setup-storage
```
*(A popup will appear asking for storage permission. Tap Allow).*

**2. Install Node.js:**
```bash
pkg update
pkg install nodejs
```

**3. Unzip your bot:**
```bash
cp ~/storage/downloads/linkedin-bot.zip ~/
unzip linkedin-bot.zip
cd linkedin-bot
```

**4. Install dependencies and start the bot!**
```bash
npm install
npm start
```

## Step 4: Keep it Awake Forever
Swipe down your notification shade in Android, find the active Termux notification, expand it, and tap **"Acquire wakelock"**. This tells Android never to let the bot sleep!
