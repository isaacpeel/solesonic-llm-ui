import PropTypes from "prop-types";

const modelProps = PropTypes.propTypes = {
    selectedModel: PropTypes.shape(
        {
            name: PropTypes.string.isRequired,
            censored: PropTypes.bool.isRequired,
            ollamaModel: PropTypes.shape({
                details: PropTypes.shape({
                    parentModel: PropTypes.string,
                    format: PropTypes.string.isRequired,
                    family: PropTypes.string.isRequired,
                    families: PropTypes.array.isRequired,
                    parameter_size: PropTypes.string.isRequired,
                    quantization_level: PropTypes.string.isRequired,
                    parent_model: PropTypes.string.isRequired,
                })
            }),
            ollamaShow: PropTypes.shape({
                capabilities: PropTypes.arrayOf(PropTypes.string).isRequired,
            })
        }
    )
}

export default modelProps;

