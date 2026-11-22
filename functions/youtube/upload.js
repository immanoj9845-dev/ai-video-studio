export async function onRequest(context) {
  const { request, env, params } = context;
  const path = params.path || "";
  const url = new URL(request.url);

  // Handle video upload
  if (path === "upload" && request.method === "POST") {
    const body = await request.json();
    const { access_token, videoFile, metadata } = body;

    if (!access_token) {
      return new Response(JSON.stringify({ error: "No access token provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!videoFile) {
      return new Response(JSON.stringify({ error: "No video file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      // Step 1: Create upload session (resumable upload)
      const createResponse = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": videoFile.size.toString(),
        },
        body: JSON.stringify({
          snippet: {
            title: metadata.title || "AI Generated Video",
            description: metadata.description || "",
            tags: metadata.tags || ["AI", "generated", "video"],
            categoryId: "28", // Science & Technology
          },
          status: {
            privacyStatus: metadata.privacyStatus || "private", // private, unlisted, public
            selfDeclaredMadeForKids: false,
          },
        }),
      });

      const uploadUrl = createResponse.headers.get("location");
      if (!uploadUrl) {
        const errorText = await createResponse.text();
        return new Response(JSON.stringify({ error: "Failed to create upload session", details: errorText }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Step 2: Upload video data
      const videoResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": videoFile.size.toString(),
        },
        body: videoFile,
      });

      if (!videoResponse.ok) {
        const errorText = await videoResponse.text();
        return new Response(JSON.stringify({ error: "Video upload failed", details: errorText }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const videoData = await videoResponse.json();

      // Step 3: Set thumbnail if provided
      if (metadata.thumbnail) {
        await fetch(`https://www.googleapis.com/youtube/v3/thumbnails/set?videoId=${videoData.id}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            thumbnail: metadata.thumbnail,
          }),
        });
      }

      return new Response(JSON.stringify({
        success: true,
        video: {
          id: videoData.id,
          url: `https://www.youtube.com/watch?v=${videoData.id}`,
          title: videoData.snippet.title,
          status: videoData.status.privacyStatus,
        },
      }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Handle scheduled upload
  if (path === "schedule" && request.method === "POST") {
    const body = await request.json();
    const { access_token, videoId, publishAt } = body;

    if (!access_token || !videoId || !publishAt) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: videoId,
          status: {
            privacyStatus: "private",
            publishAt: publishAt, // ISO 8601 format
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: "Failed to schedule video", details: errorText }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Get channel monetization status
  if (path === "monetization" && request.method === "GET") {
    const accessToken = url.searchParams.get("access_token");

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "No access token provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      // Get channel info with contentDetails for monetization
      const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails,status&mine=true", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const channelData = await channelResponse.json();
      const channel = channelData.items?.[0];

      if (!channel) {
        return new Response(JSON.stringify({ error: "Channel not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Check YouTube Partner Program eligibility
      const subscriberCount = parseInt(channel.statistics?.subscriberCount || "0");
      const viewCount = parseInt(channel.statistics?.viewCount || "0");

      // Get video count for watch hours estimation (approximate)
      const videoCount = parseInt(channel.statistics?.videoCount || "0");

      // Note: Exact watch hours requires YouTube Analytics API which needs additional scopes
      // This is an estimation based on available data
      const estimatedWatchHours = viewCount * 0.5 / 3600; // rough estimate

      const isEligible = subscriberCount >= 1000 && estimatedWatchHours >= 4000;
      const monetizationStatus = channel.status?.isMonetizationEnabled ? "enabled" :
                                 channel.status?.madeForKids ? "madeForKids" :
                                 isEligible ? "eligible" : "not_eligible";

      return new Response(JSON.stringify({
        channel: {
          id: channel.id,
          title: channel.snippet.title,
          thumbnail: channel.snippet.thumbnails?.default?.url,
          subscriberCount,
          viewCount,
          videoCount,
          estimatedWatchHours: Math.round(estimatedWatchHours),
        },
        monetization: {
          status: monetizationStatus,
          isEligible,
          requirements: {
            subscribers: { current: subscriberCount, required: 1000, met: subscriberCount >= 1000 },
            watchHours: { current: Math.round(estimatedWatchHours), required: 4000, met: estimatedWatchHours >= 4000 },
          },
        },
      }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Get upload status
  if (path === "status" && request.method === "GET") {
    const accessToken = url.searchParams.get("access_token");
    const videoId = url.searchParams.get("video_id");

    if (!accessToken || !videoId) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,statistics&id=${videoId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = await response.json();
      const video = data.items?.[0];

      if (!video) {
        return new Response(JSON.stringify({ error: "Video not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        video: {
          id: video.id,
          title: video.snippet.title,
          status: video.status.privacyStatus,
          publishAt: video.status.publishAt,
          viewCount: video.statistics?.viewCount,
          likeCount: video.statistics?.likeCount,
          commentCount: video.statistics?.commentCount,
          url: `https://www.youtube.com/watch?v=${video.id}`,
        },
      }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}