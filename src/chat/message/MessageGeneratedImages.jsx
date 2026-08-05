import GeneratedImage from '../../image/GeneratedImage.jsx';
import './MessageGeneratedImages.css';

/*
 * Images attached to an assistant turn. The turn is already persisted, so the only actions
 * are the ones GeneratedImage renders for itself.
 */
function MessageGeneratedImages({images, onExpand}) {
    const imageList = Array.isArray(images) ? images : [];

    if (imageList.length === 0) {
        return null;
    }

    return (
        <div className="message-generated-images">
            {imageList.map((image) => (
                <GeneratedImage key={image.imageId} image={image} onExpand={onExpand}/>
            ))}
        </div>
    );
}

export default MessageGeneratedImages;
