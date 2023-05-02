const fileContents = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Mermaid Chart</title>
  </head>
  <body>
  	<div id="graphDiv"></div>
    <script type="text/javascript">
	window.renderSvg = (svg) => {
        const chartElement = document.querySelector("#graphDiv");
        chartElement.innerHTML = svg;
    
        const svgElement = document.querySelector("#graphDiv svg");
        return {
            width: svgElement.scrollWidth,
            height: svgElement.scrollHeight,
        };
    }
	</script>
  </body>
</html>
`;

export function getFileContentBlob(): Blob {
	const bytes = new Uint8Array(fileContents.length);
	for (let i = 0; i < fileContents.length; i++) {
		bytes[i] = fileContents.charCodeAt(i);
	}
	return new Blob([bytes], { type: "text/html" });
}
