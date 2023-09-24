import { Modal, App, FrontMatterCache } from "obsidian";
import ReactDOM from "react-dom";
import React, { useState, ChangeEvent } from "react";
import { ConfluencePageConfig } from "@markdown-confluence/lib";
import { Property } from "csstype";

export type ConfluencePerPageUIValues = {
	[K in keyof ConfluencePageConfig.ConfluencePerPageConfig]: {
		value:
			| ConfluencePageConfig.ConfluencePerPageConfig[K]["default"]
			| undefined;
		isSet: boolean;
	};
};

export function mapFrontmatterToConfluencePerPageUIValues(
	frontmatter: FrontMatterCache | undefined,
): ConfluencePerPageUIValues {
	const config = ConfluencePageConfig.conniePerPageConfig;
	const result: Partial<ConfluencePerPageUIValues> = {};

	if (!frontmatter) {
		throw new Error("Missing frontmatter");
	}

	for (const propertyKey in config) {
		if (config.hasOwnProperty(propertyKey)) {
			const {
				key,
				inputType,
				default: defaultValue,
			} = config[
				propertyKey as keyof ConfluencePageConfig.ConfluencePerPageConfig
			];
			const frontmatterValue = frontmatter[key];

			if (frontmatterValue !== undefined) {
				result[propertyKey as keyof ConfluencePerPageUIValues] = {
					value: frontmatterValue,
					isSet: true,
				};
			} else {
				switch (inputType) {
					case "options":
					case "array-text":
						result[propertyKey as keyof ConfluencePerPageUIValues] =
							{ value: defaultValue as never, isSet: false };
						break;
					case "boolean":
					case "text":
						result[propertyKey as keyof ConfluencePerPageUIValues] =
							{ value: undefined, isSet: false };
						break;
					default:
						throw new Error("Missing case for inputType");
				}
			}
		}
	}
	return result as ConfluencePerPageUIValues;
}

interface FormProps {
	config: ConfluencePageConfig.ConfluencePerPageConfig;
	initialValues: ConfluencePerPageUIValues;
	onSubmit: (values: ConfluencePerPageUIValues) => void;
}

interface ModalProps {
	config: ConfluencePageConfig.ConfluencePerPageConfig;
	initialValues: ConfluencePerPageUIValues;
	onSubmit: (values: ConfluencePerPageUIValues, close: () => void) => void;
}

const handleChange = (
	key: string,
	value: unknown,
	inputValidator: ConfluencePageConfig.InputValidator<unknown>,
	setValues: React.Dispatch<React.SetStateAction<ConfluencePerPageUIValues>>,
	setErrors: React.Dispatch<React.SetStateAction<Record<string, Error[]>>>,
	isSetValue: boolean,
) => {
	const validationResult = inputValidator(value);

	setValues((prevValues) => ({
		...prevValues,
		[key]: {
			...prevValues[key as keyof ConfluencePerPageUIValues],
			...(isSetValue ? { isSet: value } : { value }),
		},
	}));
	setErrors((prevErrors) => ({
		...prevErrors,
		[key]: validationResult.valid ? [] : validationResult.errors,
	}));
};

const styles = {
	errorTd: {
		columnSpan: "all" as Property.ColumnSpan,
		color: "red",
	},
};

const renderTextInput = (
	key: string,
	config: ConfluencePageConfig.FrontmatterConfig<string, "text">,
	values: ConfluencePerPageUIValues,
	errors: Record<string, Error[]>,
	setValues: React.Dispatch<React.SetStateAction<ConfluencePerPageUIValues>>,
	setErrors: React.Dispatch<React.SetStateAction<Record<string, Error[]>>>,
) => (
	<>
		<tr key={key}>
			<td>
				<label htmlFor={key}>{config.key}</label>
			</td>
			<td>
				<input
					type="text"
					id={key}
					value={
						(values[key as keyof ConfluencePerPageUIValues]
							.value as string) ?? ""
					}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						handleChange(
							key,
							e.target.value,
							config.inputValidator,
							setValues,
							setErrors,
							false,
						)
					}
				/>
			</td>
			<td>
				<input
					type="checkbox"
					id={`${key}-isSet`}
					checked={
						values[key as keyof ConfluencePerPageUIValues]
							.isSet as boolean
					}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						handleChange(
							key,
							e.target.checked,
							config.inputValidator,
							setValues,
							setErrors,
							true,
						)
					}
				/>
			</td>
		</tr>
		<tr key={`${key}-errors`}>
			{(errors[key]?.length ?? 0) > 0 && (
				<td colSpan={3}>
					<div className="error" style={styles.errorTd}>
						{(errors[key] ?? []).map((error) => (
							<p key={error.message}>{error.message}</p>
						))}
					</div>
				</td>
			)}
		</tr>
	</>
);

const renderArrayText = (
	key: string,
	config: ConfluencePageConfig.FrontmatterConfig<string[], "array-text">,
	values: ConfluencePerPageUIValues,
	errors: Record<string, Error[]>,
	setValues: React.Dispatch<React.SetStateAction<ConfluencePerPageUIValues>>,
	setErrors: React.Dispatch<React.SetStateAction<Record<string, Error[]>>>,
) => (
	<>
		<tr key={key}>
			<td>
				<label htmlFor={key}>{config.key}</label>
			</td>
			<td>
				{(
					values[key as keyof ConfluencePerPageUIValues]
						.value as unknown as string[]
				).map((value, index) => (
					<input
						key={`${key}-${index}`}
						type="text"
						value={value}
						onChange={(e: ChangeEvent<HTMLInputElement>) => {
							const newArray = [
								...(values[
									key as keyof ConfluencePerPageUIValues
								].value as unknown as string[]),
							];
							newArray[index] = e.target.value;
							handleChange(
								key,
								newArray,
								config.inputValidator,
								setValues,
								setErrors,
								false,
							);
						}}
					/>
				))}
				<button
					type="button"
					onClick={() => {
						const newArray = [
							...(values[key as keyof ConfluencePerPageUIValues]
								.value as string[]),
							"",
						];
						handleChange(
							key,
							newArray,
							config.inputValidator,
							setValues,
							setErrors,
							false,
						);
					}}
				>
					+
				</button>
			</td>
			<td>
				<input
					type="checkbox"
					id={`${key}-isSet`}
					checked={
						values[key as keyof ConfluencePerPageUIValues]
							.isSet as boolean
					}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						handleChange(
							key,
							e.target.checked,
							config.inputValidator,
							setValues,
							setErrors,
							true,
						)
					}
				/>
			</td>
		</tr>
		<tr key={`${key}-errors`}>
			{(errors[key]?.length ?? 0) > 0 && (
				<td colSpan={3}>
					<div className="error" style={styles.errorTd}>
						{(errors[key] ?? []).map((error) => (
							<p key={error.message}>{error.message}</p>
						))}
					</div>
				</td>
			)}
		</tr>
	</>
);

const renderBoolean = (
	key: string,
	config: ConfluencePageConfig.FrontmatterConfig<boolean, "boolean">,
	values: ConfluencePerPageUIValues,
	errors: Record<string, Error[]>,
	setValues: React.Dispatch<React.SetStateAction<ConfluencePerPageUIValues>>,
	setErrors: React.Dispatch<React.SetStateAction<Record<string, Error[]>>>,
) => (
	<>
		<tr key={key}>
			<td>
				<label htmlFor={key}>{config.key}</label>
			</td>
			<td>
				<input
					type="checkbox"
					id={key}
					checked={
						values[key as keyof ConfluencePerPageUIValues]
							.value as boolean
					}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						handleChange(
							key,
							e.target.checked,
							config.inputValidator,
							setValues,
							setErrors,
							false,
						)
					}
				/>
			</td>
			<td>
				<input
					type="checkbox"
					id={`${key}-isSet`}
					checked={
						values[key as keyof ConfluencePerPageUIValues]
							.isSet as boolean
					}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						handleChange(
							key,
							e.target.checked,
							config.inputValidator,
							setValues,
							setErrors,
							true,
						)
					}
				/>
			</td>
		</tr>
		<tr key={`${key}-errors`}>
			{(errors[key]?.length ?? 0) > 0 && (
				<td colSpan={3}>
					<div className="error" style={styles.errorTd}>
						{(errors[key] ?? []).map((error) => (
							<p key={error.message}>{error.message}</p>
						))}
					</div>
				</td>
			)}
		</tr>
	</>
);
const renderOptions = (
	key: string,
	config: ConfluencePageConfig.FrontmatterConfig<
		ConfluencePageConfig.PageContentType,
		"options"
	>,
	values: ConfluencePerPageUIValues,
	errors: Record<string, Error[]>,
	setValues: React.Dispatch<React.SetStateAction<ConfluencePerPageUIValues>>,
	setErrors: React.Dispatch<React.SetStateAction<Record<string, Error[]>>>,
) => (
	<>
		<tr key={key}>
			<td>
				<label htmlFor={key}>{config.key}</label>
			</td>
			<td>
				<select
					id={key}
					value={
						values[key as keyof ConfluencePerPageUIValues]
							.value as ConfluencePageConfig.PageContentType
					}
					onChange={(e: ChangeEvent<HTMLSelectElement>) =>
						handleChange(
							key,
							e.target
								.value as ConfluencePageConfig.PageContentType,
							config.inputValidator,
							setValues,
							setErrors,
							false,
						)
					}
				>
					{config.selectOptions.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</td>
			<td>
				<input
					type="checkbox"
					id={`${key}-isSet`}
					checked={
						values[key as keyof ConfluencePerPageUIValues]
							.isSet as boolean
					}
					onChange={(e: ChangeEvent<HTMLInputElement>) =>
						handleChange(
							key,
							e.target.checked,
							config.inputValidator,
							setValues,
							setErrors,
							true,
						)
					}
				/>
			</td>
		</tr>
		<tr key={`${key}-errors`}>
			{(errors[key]?.length ?? 0) > 0 && (
				<td colSpan={3}>
					<div className="error" style={styles.errorTd}>
						{(errors[key] ?? []).map((error) => (
							<p key={error.message}>{error.message}</p>
						))}
					</div>
				</td>
			)}
		</tr>
	</>
);

const ConfluenceForm: React.FC<FormProps> = ({
	config,
	initialValues,
	onSubmit,
}) => {
	const [values, setValues] =
		useState<ConfluencePerPageUIValues>(initialValues);
	const [errors, setErrors] = useState<Record<string, Error[]>>({});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSubmit(values as ConfluencePerPageUIValues);
	};

	return (
		<form onSubmit={handleSubmit}>
			<h1>Update Confluence Page Settings</h1>
			<table>
				<thead>
					<tr>
						<td>YAML Key</td>
						<td>Value</td>
						<td>Update</td>
					</tr>
				</thead>
				<tbody>
					{Object.entries(config).map(([key, config]) => {
						switch (config.inputType) {
							case "text":
								return renderTextInput(
									key,
									config as ConfluencePageConfig.FrontmatterConfig<
										string,
										"text"
									>,
									values,
									errors,
									setValues,
									setErrors,
								);
							case "array-text":
								return renderArrayText(
									key,
									config as ConfluencePageConfig.FrontmatterConfig<
										string[],
										"array-text"
									>,
									values,
									errors,
									setValues,
									setErrors,
								);
							case "boolean":
								return renderBoolean(
									key,
									config as ConfluencePageConfig.FrontmatterConfig<
										boolean,
										"boolean"
									>,
									values,
									errors,
									setValues,
									setErrors,
								);
							case "options":
								return renderOptions(
									key,
									config as ConfluencePageConfig.FrontmatterConfig<
										ConfluencePageConfig.PageContentType,
										"options"
									>,
									values,
									errors,
									setValues,
									setErrors,
								);
							default:
								return null;
						}
					})}
				</tbody>
			</table>
			<button type="submit">Submit</button>
		</form>
	);
};

export class ConfluencePerPageForm extends Modal {
	modalProps: ModalProps;

	constructor(app: App, modalProps: ModalProps) {
		super(app);
		this.modalProps = modalProps;
	}

	override onOpen() {
		const { contentEl } = this;
		const test: FormProps = {
			...this.modalProps,
			onSubmit: (values) => {
				const boundClose = this.close.bind(this);
				this.modalProps.onSubmit(values, boundClose);
			},
		};
		ReactDOM.render(React.createElement(ConfluenceForm, test), contentEl);
	}

	override onClose() {
		const { contentEl } = this;
		ReactDOM.unmountComponentAtNode(contentEl);
		contentEl.empty();
	}
}
