import React from "react";

export interface FailedFile {
	fileName: string;
	reason: string;
}

export interface UploadResults {
	successfulUploads: number;
	errorMessage: string | null;
	failedFiles: FailedFile[];
}

export interface UploadResultsProps {
	uploadResults: UploadResults;
}

const UploadResults: React.FC<UploadResultsProps> = ({ uploadResults }) => {
	const { successfulUploads, errorMessage, failedFiles } = uploadResults;

	return (
		<div className="upload-results">
			<div>
				<h1>Confluence Publish</h1>
			</div>
			{errorMessage ? (
				<div className="error-message">
					<h3>Error</h3>
					<p>{errorMessage}</p>
				</div>
			) : (
				<>
					<div className="successful-uploads">
						<h3>Successful Uploads</h3>
						<p>
							{successfulUploads} file(s) uploaded successfully.
						</p>
					</div>

					{failedFiles.length > 0 && (
						<div className="failed-uploads">
							<h3>Failed Uploads</h3>
							<p>
								{failedFiles.length} file(s) failed to upload.
							</p>
							<ul>
								{failedFiles.map((file, index) => (
									<li key={index}>
										<strong>{file.fileName}</strong>:{" "}
										{file.reason}
									</li>
								))}
							</ul>
						</div>
					)}
				</>
			)}
		</div>
	);
};

export default UploadResults;
