export const pdfProxy = async (req, res) => {
  try {
    const pdfUrl = req.query.url;
    if (!pdfUrl) {
      return res.status(400).json({ message: 'PDF URL is required' });
    }
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      return res.status(500).json({ message: 'Unable to fetch PDF' });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    res.status(200)
    .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Content-Length': buffer.length,
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*'
    })
    .send(buffer);
  } catch (error) {
    console.error('PDF proxy error:', error);
    res.status(500).json({ message: 'PDF proxy failed' });
  }
}