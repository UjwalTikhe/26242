# Vercel Deployment Guide for DakshSetu Frontend

## Prerequisites

1. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository** - Push your code to GitHub
3. **Backend Deployed** - Your backend API must be deployed and accessible

## Quick Deploy Steps

### 1. Install Vercel CLI (Optional)

```bash
npm install -g vercel
```

### 2. Deploy from Command Line

```bash
cd frontend
vercel
```

Follow the prompts:
- **Set up and deploy?** → Yes
- **Which scope?** → Your account
- **Link to existing project?** → No
- **Project name?** → dakshsetu-frontend (or your choice)
- **In which directory is your code located?** → ./
- **Want to override the settings?** → No

### 3. Configure Environment Variables

After initial deployment, set environment variables:

**Via Vercel CLI:**
```bash
vercel env add VITE_API_URL production
# Enter your backend URL when prompted (e.g., https://your-backend.vercel.app)

vercel env add VITE_PUBLIC_BASE_URL production
# Enter your frontend URL (e.g., https://your-frontend.vercel.app)
```

**Via Vercel Dashboard:**
1. Go to your project on Vercel
2. Navigate to Settings → Environment Variables
3. Add:
   - `VITE_API_URL` = Your backend URL (without `/api`)
   - `VITE_PUBLIC_BASE_URL` = Your frontend URL

### 4. Redeploy with Environment Variables

```bash
vercel --prod
```

## Deploy via GitHub Integration (Recommended)

### 1. Connect GitHub to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Select the `frontend` folder or configure root directory

### 2. Configure Project Settings

**Framework Preset:** Vite

**Build Command:** `npm run build`

**Output Directory:** `dist`

**Environment Variables:**
- `VITE_API_URL` = Your backend URL
- `VITE_PUBLIC_BASE_URL` = Your deployed frontend URL

### 3. Deploy

Click "Deploy" - Vercel will automatically deploy on every push to your main branch.

## Backend Configuration

The frontend needs to communicate with your backend. Update the API configuration:

### Option 1: Backend on Vercel (Serverless)

If deploying backend to Vercel:
```bash
# Backend .env
VITE_API_URL=https://your-backend.vercel.app
```

### Option 2: Backend on Render/Railway

If backend is on Render/Railway:
```bash
# Frontend .env.production
VITE_API_URL=https://your-backend.onrender.com
# or
VITE_API_URL=https://your-backend.railway.app
```

### Option 3: Custom Domain

If you have a custom domain:
```bash
VITE_API_URL=https://api.yourdomain.com
VITE_PUBLIC_BASE_URL=https://www.yourdomain.com
```

## Post-Deployment Verification

### 1. Check the Deployment

Visit your Vercel URL and verify:
- ✅ Page loads without errors
- ✅ Service worker is registered (check Application tab in DevTools)
- ✅ PWA manifest is accessible at `/manifest.webmanifest`

### 2. Test API Connectivity

- Try logging in (the app should connect to your backend)
- Check browser console for any CORS errors
- Verify API calls are reaching your backend

### 3. Test PWA Features

- Open the site in mobile browser
- Check "Add to Home Screen" prompt
- Test offline functionality (disconnect network, refresh page)

## Troubleshooting

### Issue: API calls failing with 404/500

**Solution:** Verify `VITE_API_URL` is set correctly and backend is accessible.

### Issue: Service worker not working

**Solution:** The service worker is built by `vite-plugin-pwa`. Ensure:
- Build completed successfully
- `sw.js` is in the `dist` folder
- HTTPS is enabled (required for service workers)

### Issue: Environment variables not loading

**Solution:** After adding environment variables, you must redeploy:
```bash
vercel --prod
```

### Issue: PWA not installable

**Solution:** PWA requires HTTPS. Vercel provides HTTPS automatically. Ensure:
- Manifest is accessible
- Icons are present in `public/` folder
- Service worker is registered

## Custom Domain (Optional)

### 1. Add Custom Domain

In Vercel Dashboard:
1. Go to Settings → Domains
2. Add your custom domain (e.g., `app.dakshsetu.gov.in`)
3. Follow DNS instructions provided by Vercel

### 2. Update Environment Variables

Update `VITE_PUBLIC_BASE_URL` to your custom domain.

## Cost

- **Vercel Hobby Plan:** Free
  - 100GB bandwidth/month
  - Unlimited deployments
  - SSL certificates included
  - Perfect for MVP/training centre deployment

## Monitoring

Vercel provides:
- Real-time logs
- Analytics
- Performance monitoring
- Error tracking

Access these from your project dashboard.

## Continuous Deployment

With GitHub integration:
- Every push to `main` branch auto-deploys to production
- Pull requests deploy to preview URLs
- No manual deployment needed

## Support

For Vercel-specific issues:
- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Community](https://vercel.com/community)
