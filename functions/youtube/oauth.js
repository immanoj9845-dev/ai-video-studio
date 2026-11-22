export async function onRequest(context) {
  const { request, env, params } = context;
  const path = params.path || "";
  const url = new URL(request.url);

  // Handle OAuth callback from Google
  if (path === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(JSON.stringify({ error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!code) {
      return new Response(JSON.stringify({ error: "No authorization code" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Exchange code for tokens
    const tokenUrl = "https://oauth2.googleapis.com/token";
    const clientId = env.YOUTUBE_CLIENT_ID;
    const clientSecret = env.YOUTUBE_CLIENT_SECRET;
    const redirectUri = `${url.origin}/api/youtube/callback`;

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return new Response(JSON.stringify({ error: tokens.error_description || "Token exchange failed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get user's channel info
    const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const channelData = await channelResponse.json();
    const channel = channelData.items?.[0];

    // Return success - the frontend will handle the rest
    return new Response(JSON.stringify({
      tokens,
      channel: channel ? {
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        thumbnail: channel.snippet.thumbnails?.default?.url,
        subscriberCount: channel.statistics?.subscriberCount,
        viewCount: channel.statistics?.viewCount,
        videoCount: channel.statistics?.videoCount,
      } : null,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Handle token refresh
  if (path === "refresh") {
    const body = await request.json();
    const { refresh_token } = body;

    if (!refresh_token) {
      return new Response(JSON.stringify({ error: "No refresh token provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokenUrl = "https://oauth2.googleapis.com/token";
    const clientId = env.YOUTUBE_CLIENT_ID;
    const clientSecret = env.YOUTUBE_CLIENT_SECRET;

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return new Response(JSON.stringify({ error: tokens.error_description || "Token refresh failed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(tokens), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}