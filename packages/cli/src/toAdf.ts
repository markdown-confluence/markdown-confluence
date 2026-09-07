import { convertDocument } from "./convert";
import { parseConversionOptions } from "./conversionOptions";

export function markdownToAdf(args: string[]) {
	return convertDocument("to-adf", args);
}
export function parseToAdfOptions(args: string[]) {
	return parseConversionOptions(args, "to-adf");
}
